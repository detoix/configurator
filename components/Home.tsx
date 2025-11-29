'use client';

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type MutableRefObject,
} from "react";
import { MathUtils, Spherical, Vector3, Object3D, Mesh } from "three";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { VisibilityMatrix, MeshTreeNode } from "./VisibilityMatrix";

import configurator from "@/config/configurator.json";

export type RadioOption = {
  label: string;
  description: string;
  value: string;
  price?: number;
  visibility?: Record<string, boolean>;
};

export type ConfiguratorGroup = {
  id: string;
  title: string;
  helper: string;
  options: RadioOption[];
};

export type ConfigRadioGroupProps = ConfiguratorGroup & {
  value: string;
  onChange: (value: string) => void;
};

export type FocusTargetConfig = {
  radius: number;
  polarDeg: number;
  azimuthDeg: number;
  lookAt: [number, number, number];
};

export type SceneModelConfig = {
  src: string;
  position: [number, number, number];
  rotationDeg?: [number, number, number];
  scale?: [number, number, number];
};

export type Config = {
  hero: {
    kicker: string;
    title: string;
    paragraphs: string[];
  };
  scene: {
    focusTargets: Record<string, FocusTargetConfig>;
    model: SceneModelConfig;
  };
  chapters: Array<{
    id: string;
    focus: string;
    kicker: string;
    title: string;
    description: string;
    groups: ConfiguratorGroup[];
    visibility?: Record<string, boolean>;
  }>;
  closing: {
    kicker: string;
    title: string;
    paragraphs: string[];
  };
};

export type HomeClassNames = {
  root: string;
  main: string;
  heroSection: string;
  heroKicker: string;
  heroTitle: string;
  heroParagraph: string;
  chaptersSection: string;
  canvasWrapper: string;
  chapterContainer: string;
  chapterHeader: string;
  chapterKicker: string;
  chapterTitle: string;
  chapterDescription: string;
  groupWrapper: string;
  closingSection: string;
  closingKicker: string;
  closingTitle: string;
  closingParagraph: string;
};

export type HomeProps = {
  config?: Config;
  classNames?: Partial<HomeClassNames>;
};

const defaultConfig = configurator as unknown as Config;

const defaultClasses: HomeClassNames = {
  root: "bg-slate-950 text-white",
  main: "mx-auto flex max-w-6xl flex-col gap-24 px-6 py-16",
  heroSection: "space-y-10 text-lg leading-relaxed text-slate-200",
  heroKicker: "text-sm uppercase tracking-[0.5em] text-teal-200",
  heroTitle: "text-4xl font-semibold text-white sm:text-6xl",
  heroParagraph: "text-base text-white/70 md:hidden",
  chaptersSection: "space-y-16",
  canvasWrapper:
    "sticky top-0 z-20 h-[33vh] min-h-[280px] w-screen max-w-none -mx-6 overflow-hidden rounded-none border border-white/10 bg-black shadow-2xl sm:mx-0 sm:w-full sm:rounded-3xl md:mt-16 md:top-[14rem]",
  chapterContainer: "space-y-8 pb-32",
  chapterHeader: "space-y-3",
  chapterKicker: "text-sm uppercase tracking-[0.4em] text-teal-200",
  chapterTitle: "text-3xl font-semibold",
  chapterDescription: "text-base text-white/70",
  groupWrapper: "space-y-6",
  closingSection: "space-y-8 pb-24 text-lg leading-relaxed text-slate-200",
  closingKicker: "text-sm uppercase tracking-[0.4em] text-teal-200",
  closingTitle: "text-3xl font-semibold text-white",
  closingParagraph: "",
};

const ItemTypes = {
  CHAPTER: "chapter",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function resolveModelUrl(src: string) {
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (typeof window !== "undefined") {
    try {
      return new URL(src, window.location.origin).toString();
    } catch {
      return src;
    }
  }
  return src;
}

function normalizeConfigPrices(config: Config): Config {
  return {
    ...config,
    chapters: config.chapters.map((chapter) => ({
      ...chapter,
      groups: chapter.groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          price: option.price ?? 0,
        })),
      })),
    })),
  };
}

type SceneFocus = keyof Config["scene"]["focusTargets"];
type FocusTarget = { radius: number; polar: number; azimuth: number; lookAt: Vector3 };
type FocusTargetsMap = Record<SceneFocus, FocusTarget>;

function buildFocusTargets(config: Config): FocusTargetsMap {
  return Object.entries(config.scene.focusTargets).reduce((acc, [key, value]) => {
    acc[key as SceneFocus] = {
      radius: value.radius,
      polar: MathUtils.degToRad(value.polarDeg),
      azimuth: MathUtils.degToRad(value.azimuthDeg),
      lookAt: new Vector3(...value.lookAt),
    };
    return acc;
  }, {} as FocusTargetsMap);
}

function buildDefaultSelections(config: Config) {
  const initial: Record<string, string> = {};
  config.chapters.forEach((chapter) => {
    chapter.groups.forEach((group) => {
      initial[group.id] = group.options[0]?.value ?? "";
    });
  });
  return initial;
}

function CameraRig({
  focus,
  focusTargets,
  orbitEnabled,
  manualState,
  resetToken,
}: {
  focus: SceneFocus;
  focusTargets: FocusTargetsMap;
  orbitEnabled: boolean;
  manualState: { position: [number, number, number]; target: [number, number, number] } | null;
  resetToken: number;
}) {
  const { camera } = useThree();
  const temp = useMemo(() => new Vector3(), []);
  const spherical = useRef(
    new Spherical(
      focusTargets[focus].radius,
      focusTargets[focus].polar,
      focusTargets[focus].azimuth
    )
  );
  const transition = useRef<{
    start: Spherical;
    end: Spherical;
    duration: number;
    progress: number;
    active: boolean;
  }>({
    start: new Spherical(),
    end: new Spherical(),
    duration: 1,
    progress: 1,
    active: false,
  });
  const lookAtCurrent = useRef(focusTargets[focus].lookAt.clone());
  const lookAtTarget = useRef(focusTargets[focus].lookAt.clone());
  const prevFocusRef = useRef<SceneFocus>(focus);
  const prevResetRef = useRef<number>(resetToken);

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  useEffect(() => {
    if (orbitEnabled) return;
    const isFocusSame = prevFocusRef.current === focus;
    const isResetSame = prevResetRef.current === resetToken;
    if (isFocusSame && isResetSame) return;
    const target = focusTargets[focus];
    transition.current.start.copy(spherical.current);
    transition.current.end.radius = target.radius;
    transition.current.end.phi = target.polar;
    transition.current.end.theta = target.azimuth;
    transition.current.duration = 1.2;
    transition.current.progress = 0;
    transition.current.active = true;
    lookAtTarget.current.copy(target.lookAt);
    prevFocusRef.current = focus;
    prevResetRef.current = resetToken;
  }, [focus, focusTargets, orbitEnabled, resetToken]);

  useEffect(() => {
    if (orbitEnabled) return;
    if (!manualState) return;
    const target = new Vector3(...manualState.target);
    const position = new Vector3(...manualState.position);
    lookAtCurrent.current.copy(target);
    lookAtTarget.current.copy(target);
    temp.copy(position).sub(target);
    spherical.current.setFromVector3(temp);
    transition.current.active = false;
  }, [manualState, orbitEnabled, temp]);

  useFrame((_, delta) => {
    if (orbitEnabled) return;
    const current = spherical.current;
    const tween = transition.current;

    if (tween.active) {
      tween.progress = Math.min(tween.progress + delta / tween.duration, 1);
      const eased = easeOutCubic(tween.progress);
      current.radius = MathUtils.lerp(tween.start.radius, tween.end.radius, eased);
      current.phi = MathUtils.lerp(tween.start.phi, tween.end.phi, eased);
      current.theta = MathUtils.lerp(tween.start.theta, tween.end.theta, eased);
      if (tween.progress === 1) {
        tween.active = false;
      }
    }

    lookAtCurrent.current.lerp(lookAtTarget.current, 0.08);
    temp.setFromSpherical(current).add(lookAtCurrent.current);
    camera.position.copy(temp);
    camera.lookAt(lookAtCurrent.current);
  });

  return null;
}

function SingleModel({
  modelConfig,
  visibility,
  gltfScene,
}: {
  modelConfig: SceneModelConfig;
  visibility: Record<string, boolean | undefined>;
  gltfScene: Object3D;
}) {
  const instance = useMemo(() => gltfScene.clone(), [gltfScene]);

  const rotation = useMemo(() => {
    const [x = 0, y = 0, z = 0] = modelConfig.rotationDeg ?? [0, 0, 0];
    return [MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z)] as [
      number,
      number,
      number,
    ];
  }, [modelConfig]);

  useEffect(() => {
    instance.traverse((child) => {
      if (child instanceof Mesh || child instanceof Object3D) {
        const override = visibility[child.name];
        const shouldHide = override === false;
        child.visible = !shouldHide;
        if (child instanceof Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat) return;
            mat.transparent = false;
            mat.opacity = 1;
            mat.depthWrite = true;
            mat.needsUpdate = true;
          });
        }
      }
    });
  }, [instance, visibility]);

  return (
    <primitive
      object={instance}
      position={modelConfig.position}
      rotation={rotation}
      scale={modelConfig.scale ?? [1, 1, 1]}
      castShadow
      receiveShadow
    />
  );
}

function ConfigRadioGroup({ title, helper, options, value, onChange }: ConfigRadioGroupProps) {
  const name = useId();

  return (
    <fieldset className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <legend className="text-base font-semibold uppercase tracking-[0.3em] text-white/70">
        {title}
      </legend>
      <p className="mt-2 text-sm text-white/70">{helper}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={`flex cursor-pointer flex-col gap-1 rounded-2xl border px-4 py-3 ${
                value === option.value
                  ? "border-teal-400 bg-teal-400/10 text-white"
                  : "border-white/10 text-white/80"
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="text-sm font-semibold uppercase tracking-widest">
                {option.label}
              </span>
              <span className="text-xs text-white/70">{option.description}</span>
              <span className="text-xs font-semibold text-teal-200">
                {currency.format(option.price ?? 0)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type OptionDraft = Pick<RadioOption, "label" | "description" | "price">;

function EditableOptionRow({
  option,
  name,
  checked,
  onSelect,
  onDelete,
  onEdit,
  onOpenModel,
}: {
  option: RadioOption;
  name: string;
  checked: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: (next: OptionDraft) => void;
  onOpenModel: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<OptionDraft>(() => ({
    label: option.label,
    description: option.description,
    price: option.price ?? 0,
  }));

  const handleSave = () => {
    onEdit({
      ...draft,
      price: Number.isFinite(draft.price) ? draft.price : 0,
    });
    setIsEditing(false);
  };

  const cardClass =
    checked
      ? "border-teal-400 bg-teal-400/10 text-white"
      : "border-white/10 bg-white/5 text-white/80 hover:border-white/20";

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 transition ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex flex-1 cursor-pointer items-start gap-3" onClick={onSelect}>
          <input
            type="radio"
            name={name}
            checked={checked}
            onChange={onSelect}
            className="mt-1 h-4 w-4 accent-teal-300"
          />
          {isEditing ? (
            <div className="flex-1 space-y-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                value={draft.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Label"
              />
              <input
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                value={draft.description}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDraft((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Description"
              />
              <input
                type="number"
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                value={draft.price}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDraft((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))
                }
                placeholder="Price"
              />
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white">{option.label}</p>
              <p className="text-xs text-white/70">{option.description}</p>
              <p className="text-xs font-semibold text-teal-200">{currency.format(option.price ?? 0)}</p>
            </div>
          )}
        </label>
        <div className="flex flex-col gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-teal-400 px-3 py-1 text-xs font-semibold text-slate-900"
            >
              Save
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={isEditing ? () => setIsEditing(false) : onDelete}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
            >
              {isEditing ? "Cancel" : "Delete"}
            </button>
        </div>
      </div>
    </div>
  );
}

function EditableConfigGroup({
  group,
  value,
  onChange,
  onAdd,
  onDelete,
  onEdit,
  onOpenModel,
  onDeleteGroup,
}: {
  group: ConfiguratorGroup;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (optionValue: string) => void;
  onEdit: (originalValue: string, next: OptionDraft) => void;
  onOpenModel: (optionValue: string) => void;
  onDeleteGroup: () => void;
}) {
  const name = useId();

  return (
    <fieldset className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <legend className="text-base font-semibold uppercase tracking-[0.3em] text-white/70">
            {group.title}
          </legend>
          <p className="mt-2 text-sm text-white/70">{group.helper}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-teal-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200 hover:border-teal-300"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onDeleteGroup}
          className="rounded-full border border-red-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-100 hover:border-red-300"
        >
          Delete group
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {group.options.map((option) => (
          <EditableOptionRow
            key={`${option.value}-${option.label}-${option.description}`}
            option={option}
            name={name}
            checked={value === option.value}
            onSelect={() => onChange(option.value)}
            onDelete={() => onDelete(option.value)}
            onEdit={(next) => onEdit(option.value, next)}
            onOpenModel={() => onOpenModel(option.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ConfiguratorCanvas({
  focus,
  modelConfig,
  visibility,
  focusTargets,
  gltfScene,
  orbitEnabled,
  onOrbitCameraChange,
  orbitCameraState,
  resetToken,
}: {
  focus: SceneFocus;
  modelConfig: SceneModelConfig;
  visibility: Record<string, boolean | undefined>;
  focusTargets: FocusTargetsMap;
  gltfScene: Object3D | null;
  orbitEnabled: boolean;
  onOrbitCameraChange: (state: { position: [number, number, number]; target: [number, number, number] }) => void;
  orbitCameraState: { position: [number, number, number]; target: [number, number, number] } | null;
  resetToken: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const handleOrbitChange = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const position = controls.object.position.toArray() as [number, number, number];
    const target = controls.target.toArray() as [number, number, number];
    onOrbitCameraChange({ position, target });
  }, [onOrbitCameraChange]);

  const handleOrbitStart = useCallback(() => {
    handleOrbitChange();
  }, [handleOrbitChange]);

  if (!gltfScene) return null;
  return (
    <Canvas shadows camera={{ position: [4, 3, 6], fov: 50 }}>
      <color attach="background" args={["#0f172a"]} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[5, 10, 5]}
        castShadow
        intensity={1.1}
        shadow-mapSize={[1024, 1024]}
      />
      <Suspense fallback={null}>
        <CameraRig
          focus={focus}
          focusTargets={focusTargets}
          orbitEnabled={orbitEnabled}
          manualState={orbitCameraState}
          resetToken={resetToken}
        />
        {orbitEnabled && (
          <OrbitControls
            enableDamping
            makeDefault
            ref={controlsRef}
            onChange={handleOrbitChange}
            onStart={handleOrbitStart}
          />
        )}
        <SingleModel modelConfig={modelConfig} visibility={visibility} gltfScene={gltfScene} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      </Suspense>
      {orbitEnabled && (
        <ambientLight intensity={0.05} color="#88ffff" />
      )}
    </Canvas>
  );
}

type DraggedChapter = {
  id: string;
  index: number;
};

// MeshTreeNode type is now imported from VisibilityMatrix

function GltfSceneLoader({ url, onLoaded }: { url: string; onLoaded: (scene: Object3D) => void }) {
  const gltf = useGLTF(url);

  useEffect(() => {
    if (gltf?.scene) onLoaded(gltf.scene);
  }, [gltf, onLoaded]);

  useEffect(() => {
    useGLTF.preload(url);
  }, [url]);

  return null;
}

function MeshTreeNodeView({
  node,
  visibility,
  onToggle,
}: {
  node: MeshTreeNode;
  visibility: Record<string, boolean | undefined>;
  onToggle: (meshName: string) => void;
}) {
  const checked = visibility[node.name] !== false;
  const hasChildren = node.children.length > 0;
  return (
    <div className="space-y-1 rounded-lg border border-white/5 bg-white/5 p-2">
      {node.isMesh && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(node.name)}
            className="h-4 w-4 accent-teal-300"
          />
          <span className="text-white">{node.name}</span>
        </label>
      )}
      {!node.isMesh && node.name && (
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">{node.name}</p>
      )}
      {!node.isMesh && hasChildren && (
        <div className="space-y-1 pl-3">
          {node.children.map((child, index) => (
            <MeshTreeNodeView
              key={`${child.name}-${index}`}
              node={child}
              visibility={visibility}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildMeshTree(node: Object3D, counter: { current: number }): MeshTreeNode | null {
  const children = node.children
    .map((child) => buildMeshTree(child, counter))
    .filter(Boolean) as MeshTreeNode[];
  const isMesh = node instanceof Mesh;
  let label = node.name;
  if (isMesh) {
    if (!label || /^default_material/i.test(label) || /^material/i.test(label)) {
      label = `Mesh ${counter.current}`;
    }
    counter.current += 1;
  }
  // Ensure meshes have stable names for selection/visibility.
  if (label && node.name !== label) {
    node.name = label;
  }
  if (!label && !children.length) return null;
  return {
    name: label || "(group)",
    children,
    isMesh,
  };
}

function DraggableChapterItem({
  chapter,
  index,
  moveChapter,
  onDelete,
  active,
}: {
  chapter: Config["chapters"][number];
  index: number;
  moveChapter: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const [, drop] = useDrop<DraggedChapter>({
    accept: ItemTypes.CHAPTER,
    hover(item, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      moveChapter(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CHAPTER,
    item: { id: chapter.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    drag(drop(node));
  }, [drag, drop]);

  const cardClass = active
    ? "border-teal-400 bg-teal-400/15 text-white"
    : "border-white/10 bg-white/5 text-white/80 hover:border-white/20";

  return (
    <div
      ref={ref}
      className={`flex cursor-move items-center justify-between rounded-xl border px-3 py-2 text-sm shadow-sm transition ${cardClass}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-300" aria-hidden />
        {chapter.title}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-white/40">{chapter.kicker}</span>
        <button
          type="button"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onDelete(chapter.id);
          }}
          className="rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white hover:border-red-300 hover:text-red-200"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ChaptersList({
  orderedChapters,
  mode,
  mergedClasses,
  chapterRefs,
  editingChapters,
  chapterDrafts,
  updateChapterDraft,
  startChapterEdit,
  saveChapterEdit,
  cancelChapterEdit,
  selections,
  onChangeSelection,
  onAddGroup,
  onAddOption,
  onDeleteOption,
  onEditOption,
  onOpenModel,
  onDeleteGroup,
}: {
  orderedChapters: Config["chapters"];
  mode: "design" | "preview";
  mergedClasses: HomeClassNames;
  chapterRefs?: MutableRefObject<Record<string, HTMLDivElement | null>>;
  editingChapters: Record<string, boolean>;
  chapterDrafts: Record<string, Partial<Config["chapters"][number]>>;
  updateChapterDraft: (chapterId: string, field: "kicker" | "title" | "description", value: string) => void;
  startChapterEdit: (chapterId: string, chapter: Config["chapters"][number]) => void;
  saveChapterEdit: (chapterId: string) => void;
  cancelChapterEdit: (chapterId: string) => void;
  selections: Record<string, string>;
  onChangeSelection: (groupId: string, value: string) => void;
  onAddGroup: (chapterId: string) => void;
  onAddOption: (chapterId: string, groupId: string) => void;
  onDeleteOption: (chapterId: string, groupId: string, optionValue: string) => void;
  onEditOption: (chapterId: string, groupId: string, originalValue: string, next: OptionDraft) => void;
  onOpenModel: (chapterId: string, groupId: string, optionValue: string) => void;
  onDeleteGroup: (chapterId: string, groupId: string) => void;
}) {
  const isDesignMode = mode === "design";

  return (
    <div className="space-y-8">
      {orderedChapters.map((chapter) => (
        <div
          key={chapter.id}
          ref={(node) => {
            if (chapterRefs) chapterRefs.current[chapter.id] = node;
          }}
          className={isDesignMode ? mergedClasses.chapterContainer : "space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"}
          aria-label={`${chapter.title} configuration focus`}
        >
          {isDesignMode ? (
            <header className={`${mergedClasses.chapterHeader} flex flex-col gap-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  {editingChapters[chapter.id] ? (
                    <>
                      <input
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                        value={(chapterDrafts[chapter.id]?.kicker as string | undefined) ?? chapter.kicker}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateChapterDraft(chapter.id, "kicker", e.target.value)
                        }
                        placeholder="Kicker"
                      />
                      <input
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-lg font-semibold text-white"
                        value={(chapterDrafts[chapter.id]?.title as string | undefined) ?? chapter.title}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateChapterDraft(chapter.id, "title", e.target.value)
                        }
                        placeholder="Title"
                      />
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                        value={
                          (chapterDrafts[chapter.id]?.description as string | undefined) ?? chapter.description
                        }
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                          updateChapterDraft(chapter.id, "description", e.target.value)
                        }
                        placeholder="Description"
                        rows={3}
                      />
                    </>
                  ) : (
                    <>
                      <p className={mergedClasses.chapterKicker}>{chapter.kicker}</p>
                      <h2 className={mergedClasses.chapterTitle}>{chapter.title}</h2>
                      <p className={mergedClasses.chapterDescription}>{chapter.description}</p>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {editingChapters[chapter.id] ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveChapterEdit(chapter.id)}
                        className="rounded-full bg-teal-400 px-3 py-1 text-xs font-semibold text-slate-900"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelChapterEdit(chapter.id)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startChapterEdit(chapter.id, chapter)}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </header>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-teal-200">{chapter.kicker}</p>
              <h4 className="text-lg font-semibold text-white">{chapter.title}</h4>
              <p className="text-xs text-white/70">{chapter.description}</p>
            </div>
          )}

          <div className={isDesignMode ? mergedClasses.groupWrapper : "space-y-3"}>
            {chapter.groups.map((group) =>
              isDesignMode ? (
                <EditableConfigGroup
                  key={group.id}
                  group={group}
                  value={selections[group.id]}
                  onChange={(next) => onChangeSelection(group.id, next)}
                  onAdd={() => onAddOption(chapter.id, group.id)}
                  onDelete={(optionValue) => onDeleteOption(chapter.id, group.id, optionValue)}
                  onEdit={(originalValue, next) =>
                    onEditOption(chapter.id, group.id, originalValue, next)
                  }
                  onOpenModel={(optionValue) =>
                    onOpenModel(chapter.id, group.id, optionValue)
                  }
                  onDeleteGroup={() => onDeleteGroup(chapter.id, group.id)}
                />
              ) : (
                <ConfigRadioGroup
                  key={group.id}
                  id={group.id}
                  title={group.title}
                  helper={group.helper}
                  options={group.options}
                  value={selections[group.id]}
                  onChange={(next) => onChangeSelection(group.id, next)}
                />
              )
            )}
            {isDesignMode && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAddGroup(chapter.id)}
                  className="rounded-full border border-teal-300/60 bg-teal-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-100 hover:border-teal-300"
                >
                  Add group
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DesignSidebar({
  orderedChapters,
  moveChapter,
  activeChapterId,
  onAddChapter,
  onDeleteChapter,
  mode,
  onModeChange,
  meshTree,
  optionModelTarget,
  onCloseModel,
  onToggleMesh,
  optionVisibility,
}: {
  orderedChapters: Config["chapters"];
  moveChapter: (from: number, to: number) => void;
  activeChapterId: string | null;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  mode: "design" | "preview";
  onModeChange: (mode: "design" | "preview") => void;
  meshTree: MeshTreeNode[];
  optionModelTarget: string | null;
  onCloseModel: () => void;
  onToggleMesh: (meshName: string) => void;
  optionVisibility: Record<string, boolean | undefined>;
}) {
  return (
    <aside className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[11px] uppercase tracking-[0.3em] text-white/60 shadow-lg">
          <button
            type="button"
            onClick={() => onModeChange("design")}
            className={`rounded-full px-3 py-1.5 transition ${
              mode === "design" ? "bg-white text-slate-900 shadow" : "hover:bg-white/10"
            }`}
          >
            Design
          </button>
          <button
            type="button"
            onClick={() => onModeChange("preview")}
            className={`rounded-full px-3 py-1.5 transition ${
              mode === "preview" ? "bg-white text-slate-900 shadow" : "hover:bg-white/10"
            }`}
          >
            Preview
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-200">Design mode</p>
          <h3 className="text-lg font-semibold text-white">Component tree</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-white/70">
          drag
        </span>
      </div>

      <div className="mt-4 space-y-3 text-sm text-white/70">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60">
          <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.3em] text-white/50">
            Layout
          </div>
          <div className="divide-y divide-white/5">
            <div className="px-4 py-3 text-white/80">Hero</div>
            <div className="space-y-2 px-4 py-3">
              {orderedChapters.map((chapter, index) => (
                <DraggableChapterItem
                  key={chapter.id}
                  chapter={chapter}
                  index={index}
                  moveChapter={moveChapter}
                  onDelete={onDeleteChapter}
                  active={chapter.id === activeChapterId}
                />
              ))}
            </div>
            <div className="px-4 py-3 text-white/80">Closing</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddChapter}
          className="w-full rounded-2xl border border-teal-300/60 bg-teal-400/10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-teal-100 hover:border-teal-300"
        >
          Add chapter
        </button>
        <p className="text-xs text-white/50">Drag chapters to reorder sections in the configurator.</p>
      </div>

      {optionModelTarget && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Model visibility</p>
              <h4 className="text-sm font-semibold text-white">{optionModelTarget}</h4>
            </div>
            <button
              type="button"
              onClick={onCloseModel}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
            >
              Close
            </button>
          </div>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto text-sm text-white/80">
            {meshTree.map((node) => (
              <MeshTreeNodeView
                key={node.name}
                node={node}
                visibility={optionVisibility}
                onToggle={onToggleMesh}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/50">
            Toggle meshes this option controls. Unlisted meshes are untouched.
          </p>
        </div>
      )}
    </aside>
  );
}

function HomeContent({ config, classNames }: { config: Config; classNames?: Partial<HomeClassNames> }) {
  const [focusTargetConfigs, setFocusTargetConfigs] = useState(config.scene.focusTargets);
  const [sceneModel, setSceneModel] = useState(config.scene.model);
  const [gltfScene, setGltfScene] = useState<Object3D | null>(null);
  const [localModelUrl, setLocalModelUrl] = useState<string | null>(null);
  const [orbitEnabled, setOrbitEnabled] = useState(false);
  const [orbitCameraState, setOrbitCameraState] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const [preOrbitCameraState, setPreOrbitCameraState] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const [resetCameraToken, setResetCameraToken] = useState(0);
  const generateGroupId = useCallback(
    () => `group-${Math.random().toString(36).slice(2, 7)}`,
    []
  );
  const isClient = typeof window !== "undefined";
  const focusTargets = useMemo(
    () =>
      buildFocusTargets({
        ...config,
        scene: { ...config.scene, model: sceneModel, focusTargets: focusTargetConfigs },
      } as Config),
    [config, focusTargetConfigs, sceneModel]
  );
  const focusKeys = useMemo(() => Object.keys(focusTargets) as SceneFocus[], [focusTargets]);
  const [chapters, setChapters] = useState(config.chapters);
  const [hero, setHero] = useState(config.hero);
  const [closing, setClosing] = useState(config.closing);
  const defaultFocus = useMemo(
    () =>
      ((chapters[0]?.focus as SceneFocus | undefined) ?? focusKeys[0] ?? ("overview" as SceneFocus)),
    [chapters, focusKeys]
  );

  const mergedClasses = useMemo(
    () => ({
      ...defaultClasses,
      ...classNames,
    }),
    [classNames]
  );

  const [mode, setMode] = useState<"design" | "preview">("design");
  const [chapterOrder, setChapterOrder] = useState<string[]>(() =>
    chapters.map((chapter) => chapter.id)
  );
  const orderedChapters = useMemo(() => {
    const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const mapped = chapterOrder
      .map((id) => byId.get(id))
      .filter((chapter): chapter is Config["chapters"][number] => Boolean(chapter));
    const missing = chapters.filter((chapter) => !chapterOrder.includes(chapter.id));
    return [...mapped, ...missing];
  }, [chapterOrder, chapters]);

  const [focus, setFocus] = useState<SceneFocus>(defaultFocus);
  const focusRef = useRef<SceneFocus>(defaultFocus);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chapterListContainerMainRef = useRef<HTMLDivElement | null>(null);
  const chapterListContainerAsideRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>(() => buildDefaultSelections(config));
  const isDesignMode = mode === "design";
  const [activeChapterId, setActiveChapterId] = useState(orderedChapters[0]?.id ?? "");
  const activeChapter = useMemo(
    () => orderedChapters.find((chapter) => chapter.id === activeChapterId) ?? orderedChapters[0],
    [activeChapterId, orderedChapters]
  );
  const activeFocusKey = activeChapter?.focus as SceneFocus | undefined;
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, Partial<Config["chapters"][number]>>>(
    {}
  );
  const [editingChapters, setEditingChapters] = useState<Record<string, boolean>>({});
  const [heroDraft, setHeroDraft] = useState(hero);
  const [closingDraft, setClosingDraft] = useState(closing);
  const [isEditingHero, setIsEditingHero] = useState(false);
  const [isEditingClosing, setIsEditingClosing] = useState(false);
  const [optionModelTarget, setOptionModelTarget] = useState<{
    chapterId: string;
    groupId: string;
    optionValue: string;
  } | null>(null);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const matrixActive = isMatrixOpen && isDesignMode;
  const handleModeChange = useCallback((nextMode: "design" | "preview") => {
    setMode(nextMode);
    if (nextMode === "preview") {
      setIsMatrixOpen(false);
    }
  }, []);
  const sidebarModelUrl = useMemo(() => resolveModelUrl(sceneModel.src), [sceneModel.src]);
  const meshTree = useMemo(() => {
    const scene = gltfScene;
    if (!scene) return [] as MeshTreeNode[];
    const counter = { current: 1 };
    return scene.children.map((child) => buildMeshTree(child, counter)).filter(Boolean) as MeshTreeNode[];
  }, [gltfScene]);

  const moveChapter = useCallback((fromIndex: number, toIndex: number) => {
    setChapterOrder((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);
      return updated;
    });
  }, []);

  const addChapter = useCallback(() => {
    const newId = `chapter-${Math.random().toString(36).slice(2, 7)}`;
    const focusKey = newId as SceneFocus;
    const newChapter: Config["chapters"][number] = {
      id: newId,
      focus: focusKey,
      kicker: "New chapter",
      title: "Give this a title",
      description: "Describe this chapter",
      groups: [],
    };
    setChapters((prev) => [...prev, newChapter]);
    setChapterOrder((prev) => [...prev, newId]);
    setFocusTargetConfigs((prev) => ({
      ...prev,
      [focusKey]: {
        radius: 5,
        polarDeg: 60,
        azimuthDeg: 30,
        lookAt: [0, 0, 0],
      },
    }));
    setActiveChapterId(newId);
    setEditingChapters((prev) => ({ ...prev, [newId]: true }));
    setChapterDrafts((prev) => ({
      ...prev,
      [newId]: {
        kicker: newChapter.kicker,
        title: newChapter.title,
        description: newChapter.description,
      },
    }));
  }, []);

  const deleteChapter = useCallback(
    (chapterId: string) => {
      setChapters((prev) => prev.filter((chapter) => chapter.id !== chapterId));
      setChapterOrder((prev) => prev.filter((id) => id !== chapterId));
      setSelections((prev) => {
        const next = { ...prev };
        const chapter = chapters.find((ch) => ch.id === chapterId);
        chapter?.groups.forEach((group) => {
          delete next[group.id];
        });
        return next;
      });
      setFocusTargetConfigs((prev) => {
        const next = { ...prev };
        delete next[chapterId as SceneFocus];
        return next;
      });
      setActiveChapterId((current) => {
        if (current !== chapterId) return current;
        const nextId = chapterOrder.find((id) => id !== chapterId);
        return nextId ?? "";
      });
      setEditingChapters((prev) => {
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
      setChapterDrafts((prev) => {
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
    },
    [chapterOrder, chapters]
  );

  const updateGroupOptions = useCallback(
    (
      chapterId: string,
      groupId: string,
      updater: (options: ConfiguratorGroup["options"]) => ConfiguratorGroup["options"]
    ) => {
      setChapters((prev) =>
        prev.map((chapter) => {
          if (chapter.id !== chapterId) return chapter;
          return {
            ...chapter,
            groups: chapter.groups.map((group) =>
              group.id === groupId ? { ...group, options: updater(group.options) } : group
            ),
          };
        })
      );
    },
    []
  );

  const handleAddGroup = useCallback(
    (chapterId: string) => {
      const newGroupId = generateGroupId();
      const newOption: RadioOption = {
        label: "New option",
        description: "Describe this option",
        value: `option-${Math.random().toString(36).slice(2, 7)}`,
        price: 0,
      };
      const newGroup: ConfiguratorGroup = {
        id: newGroupId,
        title: "New group",
        helper: "Describe this group",
        options: [newOption],
      };
      setChapters((prev) =>
        prev.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, groups: [...chapter.groups, newGroup] } : chapter
        )
      );
      setSelections((prev) => ({ ...prev, [newGroupId]: newOption.value }));
    },
    [generateGroupId]
  );

  const handleDeleteGroup = useCallback((chapterId: string, groupId: string) => {
    setChapters((prev) =>
      prev.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, groups: chapter.groups.filter((group) => group.id !== groupId) }
          : chapter
      )
    );
    setSelections((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setOptionModelTarget((prev) => {
      if (prev && prev.groupId === groupId && prev.chapterId === chapterId) return null;
      return prev;
    });
  }, []);

  const handleAddOption = useCallback(
    (chapterId: string, groupId: string) => {
      const newOption: RadioOption = {
        label: "New option",
        description: "Describe this option",
        value: `option-${Math.random().toString(36).slice(2, 7)}`,
        price: 0,
      };
      updateGroupOptions(chapterId, groupId, (options) => [...options, newOption]);
    },
    [updateGroupOptions]
  );

  const startChapterEdit = useCallback((chapterId: string, chapter: Config["chapters"][number]) => {
    setEditingChapters((prev) => ({ ...prev, [chapterId]: true }));
    setChapterDrafts((prev) => ({
      ...prev,
      [chapterId]: {
        kicker: chapter.kicker,
        title: chapter.title,
        description: chapter.description,
      },
    }));
  }, []);

  const cancelChapterEdit = useCallback((chapterId: string) => {
    setEditingChapters((prev) => ({ ...prev, [chapterId]: false }));
    setChapterDrafts((prev) => {
      const next = { ...prev };
      delete next[chapterId];
      return next;
    });
  }, []);

  const updateChapterDraft = useCallback(
    (chapterId: string, field: "kicker" | "title" | "description", value: string) => {
      setChapterDrafts((prev) => ({
        ...prev,
        [chapterId]: { ...prev[chapterId], [field]: value },
      }));
    },
    []
  );

  const saveChapterEdit = useCallback(
    (chapterId: string) => {
      const draft = chapterDrafts[chapterId];
      if (!draft) return;
      setChapters((prev) =>
        prev.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                kicker: draft.kicker ?? chapter.kicker,
                title: draft.title ?? chapter.title,
                description: draft.description ?? chapter.description,
              }
            : chapter
        )
      );
      setEditingChapters((prev) => ({ ...prev, [chapterId]: false }));
      setChapterDrafts((prev) => {
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
    },
    [chapterDrafts]
  );

  const handleDeleteOption = useCallback(
    (chapterId: string, groupId: string, optionValue: string) => {
      let remainingOptions: RadioOption[] = [];
      updateGroupOptions(chapterId, groupId, (options) => {
        const next = options.filter((opt) => opt.value !== optionValue);
        remainingOptions = next;
        return next;
      });
      setSelections((prev) => {
        const current = prev[groupId];
        if (current !== optionValue) return prev;
        return {
          ...prev,
          [groupId]: remainingOptions[0]?.value ?? "",
        };
      });
    },
    [updateGroupOptions]
  );

  const handleEditOption = useCallback(
    (chapterId: string, groupId: string, originalValue: string, next: OptionDraft) => {
      updateGroupOptions(chapterId, groupId, (options) =>
        options.map((opt) =>
          opt.value === originalValue
            ? { ...opt, label: next.label, description: next.description, price: next.price ?? 0 }
            : opt
        )
      );
      setSelections((prev) => {
        if (prev[groupId] !== originalValue) return prev;
        return {
          ...prev,
          [groupId]: originalValue,
        };
      });
    },
    [updateGroupOptions]
  );

  const openOptionModelEditor = useCallback((chapterId: string, groupId: string, optionValue: string) => {
    setOptionModelTarget({ chapterId, groupId, optionValue });
  }, []);

  const visibilityTarget = useMemo(() => {
    if (optionModelTarget) return optionModelTarget;
    const chapter = orderedChapters.find((ch) => ch.id === activeChapterId) ?? orderedChapters[0];
    const group = chapter?.groups[0];
    if (!chapter || !group) return null;
    const selectedOption = selections[group.id] || group.options[0]?.value;
    if (!selectedOption) return null;
    return { chapterId: chapter.id, groupId: group.id, optionValue: selectedOption };
  }, [activeChapterId, optionModelTarget, orderedChapters, selections]);

  const optionModelVisibility = useMemo(() => {
    if (!visibilityTarget) return {} as Record<string, boolean | undefined>;
    const chapter = chapters.find((ch) => ch.id === visibilityTarget.chapterId);
    const group = chapter?.groups.find((g) => g.id === visibilityTarget.groupId);
    const option = group?.options.find((opt) => opt.value === visibilityTarget.optionValue);
    return option?.visibility ?? {};
  }, [chapters, visibilityTarget]);

  const totalPrice = useMemo(() => {
    let total = 0;
    orderedChapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        const selected = selections[group.id];
        const option = group.options.find((opt) => opt.value === selected);
        total += option?.price ?? 0;
      });
    });
    return total;
  }, [orderedChapters, selections]);

  const handleToggleMeshVisibility = useCallback(
    (meshName: string) => {
      if (!visibilityTarget) return;
      const { chapterId, groupId, optionValue } = visibilityTarget;
      updateGroupOptions(chapterId, groupId, (options) =>
        options.map((opt) => {
          if (opt.value !== optionValue) return opt;
          const visibility = { ...(opt.visibility ?? {}) };
          const current = visibility[meshName];
          const nextState = current === false ? true : false; // default visible, toggle to hidden
          visibility[meshName] = nextState;
          return { ...opt, visibility };
        })
      );
    },
    [updateGroupOptions, visibilityTarget]
  );

  const handleKeepCurrentView = useCallback(() => {
    if (!activeFocusKey || !orbitCameraState) return;
    const position = new Vector3(...orbitCameraState.position);
    const target = new Vector3(...orbitCameraState.target);
    const offset = position.clone().sub(target);
    const spherical = new Spherical().setFromVector3(offset);
    setFocusTargetConfigs((prev) => ({
      ...prev,
      [activeFocusKey]: {
        radius: spherical.radius,
        polarDeg: MathUtils.radToDeg(spherical.phi),
        azimuthDeg: MathUtils.radToDeg(spherical.theta),
        lookAt: [target.x, target.y, target.z],
      },
    }));
    setFocus(activeFocusKey);
    setOrbitEnabled(false);
  }, [activeFocusKey, orbitCameraState]);

  const deriveCameraFromFocus = useCallback(
    (focusKey: SceneFocus | undefined) => {
      if (!focusKey) return null;
      const targetConfig = focusTargetConfigs[focusKey];
      if (!targetConfig) return null;
      const target = new Vector3(...targetConfig.lookAt);
      const spherical = new Spherical(
        targetConfig.radius,
        MathUtils.degToRad(targetConfig.polarDeg),
        MathUtils.degToRad(targetConfig.azimuthDeg)
      );
      const offset = new Vector3().setFromSpherical(spherical);
      const position = target.clone().add(offset);
      return {
        position: [position.x, position.y, position.z] as [number, number, number],
        target: [target.x, target.y, target.z] as [number, number, number],
      };
    },
    [focusTargetConfigs]
  );

  const handleUpdateChapterVisibility = useCallback(
    (chapterId: string, meshName: string, visible: boolean) => {
      setChapters((prev) =>
        prev.map((chapter) => {
          if (chapter.id !== chapterId) return chapter;
          const visibility = { ...(chapter.visibility ?? {}) };
          if (visible) {
            delete visibility[meshName]; // Remove explicit false if setting to true (default)
          } else {
            visibility[meshName] = false;
          }
          return { ...chapter, visibility };
        })
      );
    },
    []
  );

  const handleUpdateOptionVisibility = useCallback(
    (
      chapterId: string,
      groupId: string,
      optionValue: string,
      meshName: string,
      visible: boolean
    ) => {
      updateGroupOptions(chapterId, groupId, (options) =>
        options.map((opt) => {
          if (opt.value !== optionValue) return opt;
          const visibility = { ...(opt.visibility ?? {}) };
          if (visible) {
            delete visibility[meshName]; // Remove explicit false if setting to true (default)
          } else {
            visibility[meshName] = false;
          }
          return { ...opt, visibility };
        })
      );
    },
    [updateGroupOptions]
  );

  const priceBar = useMemo(
    () => (
      <div className="fixed inset-x-0 bottom-0 z-40 px-0 md:bottom-4 md:left-1/2 md:right-auto md:w-full md:max-w-4xl md:-translate-x-1/2 md:px-4 md:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border-t border-white/10 bg-slate-900/90 px-5 py-3 text-sm text-white/80 shadow-2xl backdrop-blur md:rounded-2xl md:border">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-white/50">Total</span>
            <span className="ml-2 text-lg font-semibold text-white">{currency.format(totalPrice)}</span>
          </div>
          <button
            type="button"
            className="rounded-full bg-teal-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 shadow hover:bg-teal-300"
          >
            Buy now
          </button>
        </div>
      </div>
    ),
    [totalPrice]
  );

  const handleReplaceModel = useCallback(() => {
    if (!isClient) return;
    const nextSrc = window.prompt("Enter the URL or path for the new model (.glb/.gltf):", sceneModel.src);
    if (!nextSrc) return;
    const trimmed = nextSrc.trim();
    if (!trimmed) return;
    if (localModelUrl) {
      URL.revokeObjectURL(localModelUrl);
      setLocalModelUrl(null);
    }
    setGltfScene(null);
    setSceneModel((prev) => ({ ...prev, src: trimmed }));
  }, [isClient, localModelUrl, sceneModel.src]);

  const handleUploadModelClick = useCallback(() => {
    if (!isClient) return;
    fileInputRef.current?.click();
  }, [isClient]);

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      setGltfScene(null);
      setSceneModel((prev) => ({ ...prev, src: objectUrl }));
      setLocalModelUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      // Reset the input so the same file can be selected again if needed.
      event.target.value = "";
    },
    []
  );

  useEffect(
    () => () => {
      if (localModelUrl) URL.revokeObjectURL(localModelUrl);
    },
    [localModelUrl]
  );

  useEffect(() => {
    if (!orderedChapters.length) return;

    const isVisible = (el: HTMLElement | null) => !!el && el.offsetParent !== null;
    const isScrollable = (el: HTMLElement | null) =>
      !!el && isVisible(el) && el.scrollHeight > el.clientHeight + 2;

    const getActiveContainer = (): HTMLElement | Window => {
      if (isScrollable(chapterListContainerMainRef.current)) return chapterListContainerMainRef.current!;
      if (isScrollable(chapterListContainerAsideRef.current)) return chapterListContainerAsideRef.current!;
      return window; // fallback for mobile where page scroll drives focus
    };

    const handleScroll = () => {
      const container = getActiveContainer();
      const markerY = container instanceof Window ? window.innerHeight * 0.35 : container.clientHeight * 0.35;
      const containerTop = container instanceof Window ? 0 : container.getBoundingClientRect().top;
      let nextFocus: SceneFocus | null = null;
      let nextChapterId: string | null = null;

      for (const chapter of orderedChapters) {
        const element = chapterRefs.current[chapter.id];
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const top = rect.top - containerTop;
        const bottom = rect.bottom - containerTop;
        if (top <= markerY && bottom >= markerY) {
          nextFocus = chapter.focus as SceneFocus;
          nextChapterId = chapter.id;
          break;
        }
      }

      if (nextFocus && nextFocus !== focusRef.current) {
        focusRef.current = nextFocus;
        setFocus(nextFocus);
      }
      if (nextChapterId && nextChapterId !== activeChapterId) {
        setActiveChapterId(nextChapterId);
      }
    };

    handleScroll();
    const containers: Array<HTMLElement | Window> = [window];
    if (chapterListContainerMainRef.current) containers.push(chapterListContainerMainRef.current);
    if (chapterListContainerAsideRef.current) containers.push(chapterListContainerAsideRef.current);
    containers.forEach((c) => c.addEventListener("scroll", handleScroll, { passive: true }));
    window.addEventListener("resize", handleScroll);

    return () => {
      containers.forEach((c) => c.removeEventListener("scroll", handleScroll));
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeChapterId, orderedChapters]);

  useEffect(() => {
    if (!isClient) return;
    if (!matrixActive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isClient, matrixActive]);

  const objectVisibility = useMemo(() => {
    const hiddenMeshes = new Set<string>();

    // 1. Check Active Chapter
    const activeChapter = orderedChapters.find((c) => c.id === activeChapterId);
    if (activeChapter?.visibility) {
      Object.entries(activeChapter.visibility).forEach(([mesh, visible]) => {
        if (visible === false) hiddenMeshes.add(mesh);
      });
    }

    // 2. Check Selected Options
    orderedChapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        const selectedValue = selections[group.id];
        const option = group.options.find((opt) => opt.value === selectedValue);
        if (option?.visibility) {
          Object.entries(option.visibility).forEach(([meshName, state]) => {
            if (state === false) hiddenMeshes.add(meshName);
          });
        }
      });
    });

    const map: Record<string, boolean> = {};
    hiddenMeshes.forEach((mesh) => {
      map[mesh] = false;
    });
    return map;
  }, [orderedChapters, selections, activeChapterId]);

  const chaptersListProps = {
    orderedChapters,
    mode,
    mergedClasses,
    chapterRefs,
    editingChapters,
    chapterDrafts,
    updateChapterDraft,
    startChapterEdit,
    saveChapterEdit,
    cancelChapterEdit,
    selections,
    onChangeSelection: (groupId: string, value: string) =>
      setSelections((prev) => ({
        ...prev,
        [groupId]: value,
      })),
    onAddGroup: handleAddGroup,
    onAddOption: handleAddOption,
    onDeleteOption: handleDeleteOption,
    onEditOption: handleEditOption,
    onOpenModel: openOptionModelEditor,
    onDeleteGroup: handleDeleteGroup,
  };

  const content = (
    <div className="flex flex-col gap-6 pb-28 min-h-screen">
      <section className={`${mergedClasses.heroSection} max-h-[25vh] overflow-auto pr-2`}>
        {isDesignMode && isEditingHero ? (
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <input
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm uppercase tracking-[0.4em] text-white"
              value={heroDraft.kicker}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setHeroDraft((prev) => ({ ...prev, kicker: e.target.value }))
              }
              placeholder="Kicker"
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-3xl font-semibold text-white"
              value={heroDraft.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setHeroDraft((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Title"
            />
            <div className="space-y-2">
              {heroDraft.paragraphs.map((paragraph, index) => (
                <div key={index} className="flex items-start gap-2">
                  <textarea
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                    value={paragraph}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      setHeroDraft((prev) => {
                        const next = [...prev.paragraphs];
                        next[index] = e.target.value;
                        return { ...prev, paragraphs: next };
                      })
                    }
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setHeroDraft((prev) => ({
                        ...prev,
                        paragraphs: prev.paragraphs.filter((_, i) => i !== index),
                      }))
                    }
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-red-300 hover:text-red-200"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setHeroDraft((prev) => ({ ...prev, paragraphs: [...prev.paragraphs, ""] }))
                }
                className="rounded-full border border-teal-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200 hover:border-teal-300"
              >
                Add paragraph
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHero(heroDraft);
                  setIsEditingHero(false);
                }}
                className="rounded-full bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-900"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeroDraft(hero);
                  setIsEditingHero(false);
                }}
                className="rounded-full border border-white/20 px-4 py-2 text-xs text-white hover:border-white/40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <p className={mergedClasses.heroKicker}>{hero.kicker}</p>
                <h1 className={mergedClasses.heroTitle}>{hero.title}</h1>
              </div>
              {isDesignMode && (
                <button
                  type="button"
                  onClick={() => {
                    setHeroDraft(hero);
                    setIsEditingHero(true);
                  }}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="space-y-2">
              {hero.paragraphs.map((paragraph, index) => (
                <p key={index} className={mergedClasses.heroParagraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        )}
      </section>



      <div
        className={`${mergedClasses.canvasWrapper} relative flex h-[55vh] min-h-[320px] max-h-[70vh] flex-col transition-all duration-500 ease-in-out ${
          matrixActive ? "pointer-events-none opacity-0" : ""
        }`}
      >
          <div className="relative flex-1 min-h-0 w-full">
            {isDesignMode && activeChapter && activeFocusKey && (
              <div className="absolute left-3 top-3 z-30 w-[300px] space-y-3 rounded-2xl border border-white/15 bg-slate-900/80 p-3 text-white shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/60">
                  <span>Camera</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-teal-100">
                    {activeFocusKey}
                  </span>
                </div>
                <div className="flex flex-col gap-2 text-sm text-white/80">
                  {!orbitEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const snapshot =
                            orbitCameraState ?? preOrbitCameraState ?? deriveCameraFromFocus(activeFocusKey);
                          if (snapshot) {
                            setOrbitCameraState(snapshot);
                            setPreOrbitCameraState(snapshot);
                          } else {
                            setPreOrbitCameraState(null);
                          }
                          setOrbitEnabled(true);
                        }}
                        className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-white/20"
                      >
                        Change camera
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMatrixOpen((prev) => !prev)}
                        className={`rounded-full border border-teal-300/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                          isMatrixOpen
                            ? "bg-teal-400 text-slate-900 border-teal-400"
                            : "text-teal-200 hover:border-teal-300 hover:bg-teal-400/10"
                        }`}
                      >
                        {isMatrixOpen ? "Close Model" : "Model"}
                      </button>
                    </>
                  )}
                  {orbitEnabled && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/60">Use orbit to frame the shot.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const snapshot =
                              preOrbitCameraState ?? deriveCameraFromFocus(activeFocusKey) ?? orbitCameraState;
                            setOrbitCameraState(snapshot);
                            setOrbitEnabled(false);
                            setResetCameraToken((t) => t + 1);
                          }}
                          className="flex-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:border-teal-300 hover:text-teal-100"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={handleKeepCurrentView}
                          disabled={!orbitCameraState}
                          className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] shadow ${
                            orbitCameraState
                              ? "bg-teal-400 text-slate-900 hover:bg-teal-300"
                              : "bg-white/10 text-white/60"
                          }`}
                        >
                          Keep this view
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-white/50">
                  Stored for <span className="font-semibold text-white">{activeChapter.title}</span>.
                </p>
              </div>
            )}
            {isDesignMode && (
              <div className="absolute right-3 top-3 z-30 flex gap-2">
                <button
                  type="button"
                  onClick={handleUploadModelClick}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow hover:border-teal-300 hover:text-teal-100"
                >
                  Upload model
                </button>
                <button
                  type="button"
                  onClick={handleReplaceModel}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow hover:border-teal-300 hover:text-teal-100"
                >
                  Use URL
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            )}
            <ConfiguratorCanvas
              focus={focus}
              modelConfig={sceneModel}
              visibility={objectVisibility}
              focusTargets={focusTargets}
              gltfScene={gltfScene}
              orbitEnabled={orbitEnabled}
              onOrbitCameraChange={setOrbitCameraState}
              orbitCameraState={orbitCameraState}
              resetToken={resetCameraToken}
            />
          </div>
        </div>
        {matrixActive && (
          <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-black">
            <div className="relative flex-1 min-h-0 w-full">
              {isDesignMode && activeChapter && activeFocusKey && (
                <div className="absolute left-3 top-3 z-30 w-[300px] space-y-3 rounded-2xl border border-white/15 bg-slate-900/80 p-3 text-white shadow-2xl backdrop-blur">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/60">
                    <span>Camera</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-teal-100">
                      {activeFocusKey}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-white/80">
                    {!orbitEnabled && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const snapshot =
                              orbitCameraState ?? preOrbitCameraState ?? deriveCameraFromFocus(activeFocusKey);
                            if (snapshot) {
                              setOrbitCameraState(snapshot);
                              setPreOrbitCameraState(snapshot);
                            } else {
                              setPreOrbitCameraState(null);
                            }
                            setOrbitEnabled(true);
                          }}
                          className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-white/20"
                        >
                          Change camera
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMatrixOpen((prev) => !prev)}
                          className={`rounded-full border border-teal-300/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                            isMatrixOpen
                              ? "bg-teal-400 text-slate-900 border-teal-400"
                              : "text-teal-200 hover:border-teal-300 hover:bg-teal-400/10"
                          }`}
                        >
                          {isMatrixOpen ? "Close Model" : "Model"}
                        </button>
                      </>
                    )}
                    {orbitEnabled && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/60">Use orbit to frame the shot.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const snapshot =
                                preOrbitCameraState ?? deriveCameraFromFocus(activeFocusKey) ?? orbitCameraState;
                              setOrbitCameraState(snapshot);
                              setOrbitEnabled(false);
                              setResetCameraToken((t) => t + 1);
                            }}
                            className="flex-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:border-teal-300 hover:text-teal-100"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={handleKeepCurrentView}
                            disabled={!orbitCameraState}
                            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] shadow ${
                              orbitCameraState
                                ? "bg-teal-400 text-slate-900 hover:bg-teal-300"
                                : "bg-white/10 text-white/60"
                            }`}
                          >
                            Keep this view
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50">
                    Stored for <span className="font-semibold text-white">{activeChapter.title}</span>.
                  </p>
                </div>
              )}
              {isDesignMode && (
                <div className="absolute right-3 top-3 z-30 flex gap-2">
                  <button
                    type="button"
                    onClick={handleUploadModelClick}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow hover:border-teal-300 hover:text-teal-100"
                  >
                    Upload model
                  </button>
                  <button
                    type="button"
                    onClick={handleReplaceModel}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow hover:border-teal-300 hover:text-teal-100"
                  >
                    Use URL
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>
              )}
              <ConfiguratorCanvas
                focus={focus}
                modelConfig={sceneModel}
                visibility={objectVisibility}
                focusTargets={focusTargets}
                gltfScene={gltfScene}
                orbitEnabled={orbitEnabled}
                onOrbitCameraChange={setOrbitCameraState}
                orbitCameraState={orbitCameraState}
                resetToken={resetCameraToken}
              />
            </div>
            <VisibilityMatrix
              isOpen={matrixActive}
              onClose={() => setIsMatrixOpen(false)}
              chapters={orderedChapters}
              meshTree={meshTree}
              onUpdateChapterVisibility={handleUpdateChapterVisibility}
              onUpdateOptionVisibility={handleUpdateOptionVisibility}
            />
          </div>
        )}

      <div className="md:hidden px-6 pb-28">
        <ChaptersList
          {...chaptersListProps}
          listContainerRef={chapterListContainerMainRef}
        />
      </div>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={mergedClasses.root}>
        <div className="fixed right-4 top-4 z-50 flex items-center gap-1 rounded-full border border-white/10 bg-slate-900/80 p-1 text-xs uppercase tracking-[0.3em] text-white/70 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => handleModeChange("design")}
            className={`rounded-full px-3 py-1.5 transition ${
              isDesignMode ? "bg-white text-slate-900 shadow" : "hover:bg-white/10"
            }`}
          >
            Design
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("preview")}
            className={`rounded-full px-3 py-1.5 transition ${
              !isDesignMode ? "bg-white text-slate-900 shadow" : "hover:bg-white/10"
            }`}
          >
            Preview
          </button>
        </div>
        {isClient && gltfScene === null && (
          <GltfSceneLoader url={sidebarModelUrl} onLoaded={(scene) => setGltfScene(scene)} />
        )}
        
        <div className="flex flex-col md:flex-row">
          <main className="flex-1 md:h-screen md:sticky md:top-0 md:overflow-y-auto no-scrollbar">
            {content}
          </main>
          
          <aside className="hidden md:flex w-[400px] shrink-0 flex-col gap-8 p-6 border-l border-white/10 bg-slate-950/50 backdrop-blur-sm">
            {isDesignMode && (
              <DesignSidebar
                orderedChapters={orderedChapters}
                moveChapter={moveChapter}
                activeChapterId={activeChapterId}
                onAddChapter={addChapter}
                onDeleteChapter={deleteChapter}
                mode={mode}
                onModeChange={handleModeChange}
                meshTree={meshTree}
                optionModelTarget={optionModelTarget?.optionValue ?? null}
                onCloseModel={() => setOptionModelTarget(null)}
                onToggleMesh={handleToggleMeshVisibility}
                optionVisibility={optionModelVisibility}
              />
            )}
            <ChaptersList
              {...chaptersListProps}
              listContainerRef={chapterListContainerAsideRef}
            />
          </aside>
        </div>

        {priceBar}
      </div>
    </DndProvider>
  );
}

export default function Home({ config: configProp, classNames }: HomeProps) {
  const baseConfig = useMemo(() => configProp ?? defaultConfig, [configProp]);
  const normalizedConfig = useMemo(() => normalizeConfigPrices(baseConfig), [baseConfig]);
  const configKey = useMemo(() => JSON.stringify(normalizedConfig), [normalizedConfig]);

  return <HomeContent key={configKey} config={normalizedConfig} classNames={classNames} />;
}

export { defaultConfig, defaultClasses };
