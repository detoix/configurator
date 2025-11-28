'use client';

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MathUtils, Spherical, Vector3, Object3D, Mesh } from "three";
import { useGLTF } from "@react-three/drei";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import configurator from "@/config/configurator.json";

export type RadioOption = {
  label: string;
  description: string;
  value: string;
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
  heroParagraph: "",
  chaptersSection: "space-y-16",
  canvasWrapper:
    "sticky top-0 z-20 h-[33vh] min-h-[280px] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl",
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

function CameraRig({ focus, focusTargets }: { focus: SceneFocus; focusTargets: FocusTargetsMap }) {
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

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  useEffect(() => {
    const target = focusTargets[focus];
    transition.current.start.copy(spherical.current);
    transition.current.end.radius = target.radius;
    transition.current.end.phi = target.polar;
    transition.current.end.theta = target.azimuth;
    transition.current.duration = 1.2;
    transition.current.progress = 0;
    transition.current.active = true;
    lookAtTarget.current.copy(target.lookAt);
  }, [focus, focusTargets]);

  useFrame((_, delta) => {
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
}: {
  modelConfig: SceneModelConfig;
  visibility: Record<string, boolean | undefined>;
}) {
  const { scene } = useGLTF(modelConfig.src);
  const instance = useMemo(() => scene.clone(), [scene]);

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
        if (visibility[child.name] !== undefined) {
          child.visible = !!visibility[child.name];
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
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type OptionDraft = Pick<RadioOption, "label" | "description">;

function EditableOptionRow({
  option,
  name,
  checked,
  onSelect,
  onDelete,
  onEdit,
}: {
  option: RadioOption;
  name: string;
  checked: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: (next: OptionDraft) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<OptionDraft>(() => ({
    label: option.label,
    description: option.description,
  }));

  const handleSave = () => {
    onEdit(draft);
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
                onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Label"
              />
              <input
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description"
              />
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white">{option.label}</p>
              <p className="text-xs text-white/70">{option.description}</p>
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
}: {
  group: ConfiguratorGroup;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (optionValue: string) => void;
  onEdit: (originalValue: string, next: OptionDraft) => void;
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
}: {
  focus: SceneFocus;
  modelConfig: SceneModelConfig;
  visibility: Record<string, boolean | undefined>;
  focusTargets: FocusTargetsMap;
}) {
  return (
    <Canvas shadows camera={{ position: [4, 3, 6], fov: 50 }}>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 10, 5]}
        castShadow
        intensity={1.1}
        shadow-mapSize={[1024, 1024]}
      />
      <Suspense fallback={null}>
        <CameraRig focus={focus} focusTargets={focusTargets} />
        <SingleModel modelConfig={modelConfig} visibility={visibility} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      </Suspense>
    </Canvas>
  );
}

type DraggedChapter = {
  id: string;
  index: number;
};

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
          onClick={(e) => {
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

function DesignSidebar({
  chapters,
  moveChapter,
  activeChapterId,
  focusTargetConfigs,
  onUpdateFocusTarget,
  onAddChapter,
  onDeleteChapter,
  mode,
  onModeChange,
}: {
  chapters: Config["chapters"];
  moveChapter: (from: number, to: number) => void;
  activeChapterId: string | null;
  focusTargetConfigs: Config["scene"]["focusTargets"];
  onUpdateFocusTarget: (
    focusKey: SceneFocus,
    field: "radius" | "polarDeg" | "azimuthDeg" | "lookAt",
    value: number | [number, number, number]
  ) => void;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  mode: "design" | "preview";
  onModeChange: (mode: "design" | "preview") => void;
}) {
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[0];
  const activeFocusKey = activeChapter?.focus as SceneFocus | undefined;
  const activeFocus = activeFocusKey ? focusTargetConfigs[activeFocusKey] : undefined;

  const updateLookAt = (index: number, next: number) => {
    if (!activeFocus || !activeFocusKey) return;
    const nextLookAt: [number, number, number] = [...activeFocus.lookAt] as [number, number, number];
    nextLookAt[index] = next;
    onUpdateFocusTarget(activeFocusKey, "lookAt", nextLookAt);
  };

  return (
    <aside className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-auto rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
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
              {chapters.map((chapter, index) => (
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

      {activeChapter && activeFocus && activeFocusKey && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Camera</p>
              <h4 className="text-sm font-semibold text-white">{activeChapter.title}</h4>
            </div>
            <span className="text-[11px] uppercase tracking-[0.25em] text-teal-200">{activeFocusKey}</span>
          </div>
          <div className="mt-4 space-y-3 text-sm text-white/80">
            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-[0.2em] text-white/50">Radius</span>
              <input
                type="number"
                step="0.1"
                value={activeFocus.radius}
                onChange={(e) => onUpdateFocusTarget(activeFocusKey, "radius", parseFloat(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-[0.2em] text-white/50">Polar (deg)</span>
              <input
                type="number"
                step="1"
                value={activeFocus.polarDeg}
                onChange={(e) =>
                  onUpdateFocusTarget(activeFocusKey, "polarDeg", parseFloat(e.target.value))
                }
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-[0.2em] text-white/50">Azimuth (deg)</span>
              <input
                type="number"
                step="1"
                value={activeFocus.azimuthDeg}
                onChange={(e) =>
                  onUpdateFocusTarget(activeFocusKey, "azimuthDeg", parseFloat(e.target.value))
                }
                className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="space-y-2">
              <span className="block text-xs uppercase tracking-[0.2em] text-white/50">Look at</span>
              <div className="grid grid-cols-3 gap-2">
                {["X", "Y", "Z"].map((label, index) => (
                  <input
                    key={label}
                    type="number"
                    step="0.1"
                    value={activeFocus.lookAt[index]}
                    onChange={(e) => updateLookAt(index, parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                    aria-label={`Look at ${label}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function HomeContent({ config, classNames }: { config: Config; classNames?: Partial<HomeClassNames> }) {
  const [focusTargetConfigs, setFocusTargetConfigs] = useState(config.scene.focusTargets);
  const sceneModel = config.scene.model;
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

  const [mode, setMode] = useState<"design" | "preview">("preview");
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
  const [selections, setSelections] = useState<Record<string, string>>(() => buildDefaultSelections(config));
  const isDesignMode = mode === "design";
  const [activeChapterId, setActiveChapterId] = useState(orderedChapters[0]?.id ?? "");
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, Partial<Config["chapters"][number]>>>(
    {}
  );
  const [editingChapters, setEditingChapters] = useState<Record<string, boolean>>({});
  const [heroDraft, setHeroDraft] = useState(hero);
  const [closingDraft, setClosingDraft] = useState(closing);
  const [isEditingHero, setIsEditingHero] = useState(false);
  const [isEditingClosing, setIsEditingClosing] = useState(false);

  const moveChapter = useCallback((fromIndex: number, toIndex: number) => {
    setChapterOrder((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);
      return updated;
    });
  }, []);

  const handleUpdateFocusTarget = useCallback(
    (
      focusKey: SceneFocus,
      field: "radius" | "polarDeg" | "azimuthDeg" | "lookAt",
      value: number | [number, number, number]
    ) => {
      setFocusTargetConfigs((prev) => {
        const current =
          prev[focusKey] ?? {
            radius: 5,
            polarDeg: 60,
            azimuthDeg: 30,
            lookAt: [0, 0, 0],
          };
        return {
          ...prev,
          [focusKey]: {
            ...current,
            [field]: value,
          },
        };
      });
    },
    []
  );

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

  const handleAddOption = useCallback(
    (chapterId: string, groupId: string) => {
      const newOption: RadioOption = {
        label: "New option",
        description: "Describe this option",
        value: `option-${Math.random().toString(36).slice(2, 7)}`,
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
            ? { ...opt, label: next.label, description: next.description }
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

  useEffect(() => {
    useGLTF.preload(sceneModel.src);
  }, [sceneModel.src]);

  useEffect(() => {
    if (!orderedChapters.length) return;

    const handleScroll = () => {
      const markerY = window.innerHeight * 0.35;
      let nextFocus: SceneFocus | null = null;
      let nextChapterId: string | null = null;

      for (const chapter of orderedChapters) {
        const element = chapterRefs.current[chapter.id];
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top <= markerY && rect.bottom >= markerY) {
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
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [activeChapterId, orderedChapters]);

  const objectVisibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    orderedChapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        const selectedValue = selections[group.id];
        const option = group.options.find((opt) => opt.value === selectedValue);
        if (option?.visibility) {
          Object.entries(option.visibility).forEach(([meshName, state]) => {
            map[meshName] = state;
          });
        }
      });
    });
    return map;
  }, [orderedChapters, selections]);

  const content = (
    <div className="space-y-16">
      {!isDesignMode && (
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-[0.3em] text-white/60 shadow-2xl">
            <button
              type="button"
              onClick={() => setMode("design")}
              className={`rounded-full px-4 py-2 transition ${
                isDesignMode ? "bg-white text-slate-900 shadow-lg" : "hover:bg-white/10"
              }`}
            >
              Design
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded-full px-4 py-2 transition ${
                !isDesignMode ? "bg-white text-slate-900 shadow-lg" : "hover:bg-white/10"
              }`}
            >
              Preview
            </button>
          </div>
        </div>
      )}

      <section className={mergedClasses.heroSection}>
        {isDesignMode && isEditingHero ? (
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
            <input
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm uppercase tracking-[0.4em] text-white"
              value={heroDraft.kicker}
              onChange={(e) => setHeroDraft((prev) => ({ ...prev, kicker: e.target.value }))}
              placeholder="Kicker"
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-3xl font-semibold text-white"
              value={heroDraft.title}
              onChange={(e) => setHeroDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Title"
            />
            <div className="space-y-2">
              {heroDraft.paragraphs.map((paragraph, index) => (
                <div key={index} className="flex items-start gap-2">
                  <textarea
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                    value={paragraph}
                    onChange={(e) =>
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
            {hero.paragraphs.map((paragraph, index) => (
              <p key={index} className={mergedClasses.heroParagraph}>
                {paragraph}
              </p>
            ))}
          </>
        )}
      </section>

      <section className={mergedClasses.chaptersSection} aria-label="Configurator chapters">
        <div className={mergedClasses.canvasWrapper}>
          <ConfiguratorCanvas
            focus={focus}
            modelConfig={sceneModel}
            visibility={objectVisibility}
            focusTargets={focusTargets}
          />
        </div>
        {orderedChapters.map((chapter) => (
          <div
            key={chapter.id}
            ref={(node) => {
              chapterRefs.current[chapter.id] = node;
            }}
            className={mergedClasses.chapterContainer}
            aria-label={`${chapter.title} configuration focus`}
          >
            <header className={`${mergedClasses.chapterHeader} flex flex-col gap-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  {isDesignMode && editingChapters[chapter.id] ? (
                    <>
                      <input
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                        value={(chapterDrafts[chapter.id]?.kicker as string | undefined) ?? chapter.kicker}
                        onChange={(e) => updateChapterDraft(chapter.id, "kicker", e.target.value)}
                        placeholder="Kicker"
                      />
                      <input
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-lg font-semibold text-white"
                        value={(chapterDrafts[chapter.id]?.title as string | undefined) ?? chapter.title}
                        onChange={(e) => updateChapterDraft(chapter.id, "title", e.target.value)}
                        placeholder="Title"
                      />
                      <textarea
                        className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                        value={
                          (chapterDrafts[chapter.id]?.description as string | undefined) ?? chapter.description
                        }
                        onChange={(e) => updateChapterDraft(chapter.id, "description", e.target.value)}
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
                {isDesignMode && (
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
                )}
              </div>
            </header>
            <div className={mergedClasses.groupWrapper}>
              {chapter.groups.map((group) =>
                isDesignMode ? (
                  <EditableConfigGroup
                    key={group.id}
                    group={group}
                    value={selections[group.id]}
                    onChange={(next) =>
                      setSelections((prev) => ({
                        ...prev,
                        [group.id]: next,
                      }))
                    }
                    onAdd={() => handleAddOption(chapter.id, group.id)}
                    onDelete={(optionValue) => handleDeleteOption(chapter.id, group.id, optionValue)}
                    onEdit={(originalValue, next) =>
                      handleEditOption(chapter.id, group.id, originalValue, next)
                    }
                  />
                ) : (
                  <ConfigRadioGroup
                    key={group.id}
                    id={group.id}
                    title={group.title}
                    helper={group.helper}
                    options={group.options}
                    value={selections[group.id]}
                    onChange={(next) =>
                      setSelections((prev) => ({
                        ...prev,
                        [group.id]: next,
                      }))
                    }
                  />
                )
              )}
            </div>
          </div>
        ))}
      </section>

            <section className={mergedClasses.closingSection}>
              {isDesignMode && isEditingClosing ? (
                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm uppercase tracking-[0.4em] text-white"
                    value={closingDraft.kicker}
                    onChange={(e) => setClosingDraft((prev) => ({ ...prev, kicker: e.target.value }))}
                    placeholder="Kicker"
                  />
                  <input
                    className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-2xl font-semibold text-white"
                    value={closingDraft.title}
                    onChange={(e) => setClosingDraft((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Title"
                  />
                  <div className="space-y-2">
                    {closingDraft.paragraphs.map((paragraph, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <textarea
                          className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white"
                          value={paragraph}
                          onChange={(e) =>
                            setClosingDraft((prev) => {
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
                            setClosingDraft((prev) => ({
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
                        setClosingDraft((prev) => ({ ...prev, paragraphs: [...prev.paragraphs, ""] }))
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
                        setClosing(closingDraft);
                        setIsEditingClosing(false);
                      }}
                      className="rounded-full bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-900"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClosingDraft(closing);
                        setIsEditingClosing(false);
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
                      <p className={mergedClasses.closingKicker}>{closing.kicker}</p>
                      <h2 className={mergedClasses.closingTitle}>{closing.title}</h2>
                    </div>
                    {isDesignMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setClosingDraft(closing);
                          setIsEditingClosing(true);
                        }}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {closing.paragraphs.map((paragraph, index) => (
                    <p key={index} className={mergedClasses.closingParagraph}>
                      {paragraph}
                    </p>
                  ))}
                </>
              )}
            </section>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={mergedClasses.root}>
        {isDesignMode ? (
          <div className="flex w-full gap-10 px-6 py-16">
            <div className="w-[320px] shrink-0">
              <DesignSidebar
                chapters={orderedChapters}
                moveChapter={moveChapter}
                activeChapterId={activeChapterId}
                focusTargetConfigs={focusTargetConfigs}
                onUpdateFocusTarget={handleUpdateFocusTarget}
                onAddChapter={addChapter}
                onDeleteChapter={deleteChapter}
                mode={mode}
                onModeChange={setMode}
              />
            </div>
            <main className="flex-1 space-y-16">{content}</main>
          </div>
        ) : (
          <main className={mergedClasses.main}>{content}</main>
        )}
      </div>
    </DndProvider>
  );
}

export default function Home({ config: configProp, classNames }: HomeProps) {
  const config = useMemo(() => configProp ?? defaultConfig, [configProp]);
  const configKey = useMemo(() => JSON.stringify(config), [config]);

  return <HomeContent key={configKey} config={config} classNames={classNames} />;
}

export { defaultConfig, defaultClasses };
