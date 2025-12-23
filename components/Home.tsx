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
import { MathUtils, Spherical, Vector3, Object3D, Mesh, PerspectiveCamera } from "three";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { VisibilityMatrix, MeshTreeNode } from "./VisibilityMatrix";
import { PricingMatrix } from "./PricingMatrix";
import { Environment, Stage, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";

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
  getPrice?: (optionValue: string) => number;
  baselinePrice?: number;
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
  pricingRules?: Record<string, Record<string, number>>;
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
  initialMode?: "design" | "preview";
  allowModeSwitch?: boolean;
  onStateChange?: any;
};

const defaultConfig = configurator as unknown as Config;

const defaultClasses: HomeClassNames = {
  root: "bg-[#e9e9e9] text-[#111111]",
  main: "mx-auto flex max-w-6xl flex-col gap-24 px-6 py-16",
  heroSection: "space-y-10 text-lg leading-relaxed text-[#111111]",
  heroKicker: "text-sm uppercase tracking-[0.5em] text-[#ff6a3a]",
  heroTitle: "text-4xl font-semibold text-[#111111] sm:text-6xl",
  heroParagraph: "text-base text-[#111111]",
  chaptersSection: "space-y-16",
  canvasWrapper:
    "sticky top-0 z-20 h-[33vh] min-h-[280px] max-h-[70vh] w-screen max-w-none overflow-hidden rounded-none shadow-2xl sm:mx-0 sm:w-full sm:rounded-sm md:static md:top-auto md:h-full md:min-h-0 md:max-h-none md:w-full md:rounded-sm",
  chapterContainer: "space-y-8",
  chapterHeader: "space-y-3",
  chapterKicker: "text-sm uppercase tracking-[0.4em] text-[#ff6a3a]",
  chapterTitle: "text-3xl font-semibold",
  chapterDescription: "text-base text-[#111111]",
  groupWrapper: "space-y-6",
  closingSection: "space-y-8 pb-24 text-lg leading-relaxed text-[#111111]",
  closingKicker: "text-sm uppercase tracking-[0.4em] text-[#ff6a3a]",
  closingTitle: "text-3xl font-semibold text-[#111111]",
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
    pricingRules: config.pricingRules ?? {},
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

function ConfigRadioGroup({ title, helper, options, value, onChange, getPrice, baselinePrice = 0 }: ConfigRadioGroupProps) {
  const name = useId();

  return (
    <fieldset className="rounded-sm border border-[#999999] bg-white/5 p-6 backdrop-blur">
      <legend className="text-base font-semibold uppercase tracking-[0.3em] text-[#111111]">
        {title}
      </legend>
      <p className="mt-2 text-sm text-[#111111]">{helper}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const displayPrice = getPrice ? getPrice(option.value) : option.price ?? 0;
          const diff = displayPrice - baselinePrice;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={`flex cursor-pointer flex-col gap-1 rounded-sm border px-4 py-3 ${
                value === option.value
                  ? "border-[#ff6a3a] bg-[#ff6a3a]/10 text-[#111111]"
                  : "border-[#999999] text-[#111111] hover:border-[#ff6a3a]"
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
              <span className="text-xs text-[#111111]">{option.description}</span>
              <span className="text-xs font-semibold text-[#ff6a3a]">
                {diff <= 0 ? "Included" : `+${currency.format(diff)}`}
              </span>
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
  onOpenModel,
  selectedMesh,
  onToggleMeshVisibility,
  computedPrice,
  baselinePrice,
}: {
  option: RadioOption;
  name: string;
  checked: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: (next: OptionDraft) => void;
  onOpenModel: () => void;
  selectedMesh?: string | null;
  onToggleMeshVisibility?: (meshName: string, visible: boolean) => void;
  computedPrice: number;
  baselinePrice: number;
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
      ? "border-[#ff6a3a] bg-[#ff6a3a]/10 text-[#111111]"
      : "border-[#999999] text-[#111111] hover:border-[#ff6a3a]";

  return (
    <div className={`flex flex-col gap-3 rounded-sm border px-4 py-3 transition ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex flex-1 cursor-pointer items-start gap-3" onClick={onSelect}>
          <input
            type="radio"
            name={name}
            checked={checked}
            onChange={onSelect}
            className="mt-1 h-4 w-4 accent-[#ff6a3a]"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#111111]">{option.label}</p>
            <p className="text-xs text-[#111111]">{option.description}</p>
            <p className="text-xs font-semibold text-[#ff6a3a] mt-1">
              {computedPrice - baselinePrice <= 0
                ? "Included"
                : `+${currency.format(computedPrice - baselinePrice)}`}
            </p>
          </div>
        </label>
        <div className="flex flex-col gap-2 items-end">
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-sm border border-[#999999] px-3 py-1 text-xs text-[#111111] hover:border-[#ff6a3a] bg-white/50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-2 pt-4 border-t border-[#999999]/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#111111]/50">Label</label>
              <input
                className="w-full rounded-sm border border-[#999999] bg-white/50 px-3 py-2 text-sm text-[#111111] focus:border-[#ff6a3a] focus:outline-none transition-colors"
                value={draft.label}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Option Label"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#111111]/50">Description</label>
              <input
                className="w-full rounded-sm border border-[#999999] bg-white/50 px-3 py-2 text-sm text-[#111111] focus:border-[#ff6a3a] focus:outline-none transition-colors"
                value={draft.description}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDraft((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Short description"
              />
            </div>
          </div>

          {selectedMesh && onToggleMeshVisibility && (
            <div className="rounded-sm bg-[#111111]/5 p-3 space-y-2">
               <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#111111]/70">
                  Mesh Visibility Override
                </span>
                <span className="font-mono text-[10px] text-[#111111]/50 bg-white/50 px-1.5 py-0.5 rounded">
                  {selectedMesh}
                </span>
              </div>
              
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs text-[#111111]">
                  Visible when selected
                </span>
                <div className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#ff6a3a] focus:ring-offset-2 bg-[#999999]/30 has-[:checked]:bg-[#ff6a3a]">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={option.visibility?.[selectedMesh] !== false}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      onToggleMeshVisibility(selectedMesh, e.target.checked)
                    }
                  />
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      option.visibility?.[selectedMesh] !== false ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </div>
              </label>
              <p className="text-[10px] text-[#111111]/50 leading-tight">
                Controls whether <strong>{selectedMesh}</strong> is visible when this option is active.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onDelete}
              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-sm transition-colors"
            >
              Delete Option
            </button>
            <div className="h-4 w-px bg-[#999999]/30 mx-1" />
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-xs font-semibold text-[#111111]/70 hover:text-[#111111] hover:bg-black/5 rounded-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-bold text-white bg-[#ff6a3a] hover:bg-[#ff8a6a] rounded-sm shadow-sm transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
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
  onUpdateGroup,
  selectedMesh,
  onUpdateMeshVisibility,
  getPrice,
  baselinePrice,
}: {
  group: ConfiguratorGroup;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (optionValue: string) => void;
  onEdit: (originalValue: string, next: OptionDraft) => void;
  onOpenModel: (optionValue: string) => void;
  onDeleteGroup: () => void;
  onUpdateGroup: (next: { title: string; helper: string }) => void;
  selectedMesh?: string | null;
  onUpdateMeshVisibility?: (optionValue: string, visible: boolean) => void;
  getPrice: (optionValue: string) => number;
  baselinePrice: number;
}) {
  const name = useId();

  return (
    <fieldset className="rounded-sm border border-[#999999] bg-white/5 p-6 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <legend className="text-base font-semibold uppercase tracking-[0.3em] text-[#111111]">
            <input
              className="mt-1 w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-sm text-[#111111]"
              value={group.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onUpdateGroup({ title: e.target.value, helper: group.helper })
              }
              placeholder="Group title"
            />
          </legend>
          <input
            className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-sm text-[#111111]"
            value={group.helper}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onUpdateGroup({ title: group.title, helper: e.target.value })
            }
            placeholder="Group subtitle / helper"
          />
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDeleteGroup}
            className="rounded-sm border border-red-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-500 hover:border-red-300"
          >
            Delete group
          </button>
        </div>
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
            selectedMesh={selectedMesh}
            onToggleMeshVisibility={
              selectedMesh && onUpdateMeshVisibility
                ? (meshName, visible) => onUpdateMeshVisibility(option.value, visible)
                : undefined
            }
            baselinePrice={baselinePrice}
            computedPrice={getPrice(option.value)}
          />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[#999999]/40 bg-white/5 p-4 text-[#111111]/40 transition-all hover:border-[#ff6a3a] hover:bg-[#ff6a3a]/5 hover:text-[#ff6a3a]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-widest">Add Option</span>
        </button>
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
  mode,
  freezeResize = false,
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
  mode: "design" | "preview";
  freezeResize?: boolean;
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
      {/* <CanvasResizer mode={mode} freezeResize={freezeResize} /> */}
      <color attach="background" args={["#e9e9e9"]} />
      
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
        
        <Stage intensity={0.5} environment="studio" shadows={false} adjustCamera={false}>
          <SingleModel modelConfig={modelConfig} visibility={visibility} gltfScene={gltfScene} />
        </Stage>
        
        <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
      </Suspense>

      <EffectComposer>
        <SMAA />
        <Bloom luminanceThreshold={1} mipmapBlur intensity={0.5} radius={0.4} />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}

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

function flattenMeshNames(nodes: MeshTreeNode[]): string[] {
  const names: string[] = [];
  nodes.forEach((node) => {
    if (node.isMesh) {
      names.push(node.name);
    }
    if (node.children.length > 0) {
      names.push(...flattenMeshNames(node.children));
    }
  });
  return Array.from(new Set(names)).sort();
}

function ChaptersList({
  orderedChapters,
  mode,
  mergedClasses,
  chapterRefs,
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
  onUpdateGroup,
  activeMeshName,
  onUpdateOptionVisibility,
  trackFocus = false,
  collapsedChapters,
  toggleCollapse,
  moveChapter,
  getPrice,
  onAddChapter,
  onDeleteChapter,
  getBaseline,
}: {
  orderedChapters: Config["chapters"];
  mode: "design" | "preview";
  mergedClasses: HomeClassNames;
  chapterRefs?: MutableRefObject<Record<string, HTMLDivElement | null>>;
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
  onUpdateGroup: (
    chapterId: string,
    groupId: string,
    next: {
      title: string;
      helper: string;
    }
  ) => void;
  activeMeshName?: string | null;
  onUpdateOptionVisibility?: (
    chapterId: string,
    groupId: string,
    optionValue: string,
    meshName: string,
    visible: boolean
  ) => void;
  trackFocus?: boolean;
  collapsedChapters: Record<string, boolean>;
  toggleCollapse: (chapterId: string) => void;
  moveChapter?: (from: number, to: number) => void;
  getPrice: (optionValue: string) => number;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  getBaseline: (groupId: string) => number;
}) {
  const isDesignMode = mode === "design";

  return (
    <div className="space-y-8 chapter-list-container">
      {orderedChapters.map((chapter, index) => (
        <div
          key={chapter.id}
          ref={(node) => {
            if (trackFocus && chapterRefs) chapterRefs.current[chapter.id] = node;
          }}
          data-chapter-id={chapter.id}
          className={`${
            true
              ? mergedClasses.chapterContainer
              : "space-y-3 rounded-sm border border-[#999999] bg-[#e9e9e9] p-4"
          } relative`}
          aria-label={`${chapter.title} configuration focus`}
        >
          {isDesignMode ? (
            <header className={`${mergedClasses.chapterHeader} flex flex-col gap-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <input
                    className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-[#111111]"
                    value={chapter.kicker}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateChapterDraft(chapter.id, "kicker", e.target.value)
                    }
                    placeholder="Kicker"
                  />
                  <input
                    className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-lg font-semibold text-[#111111]"
                    value={chapter.title}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateChapterDraft(chapter.id, "title", e.target.value)
                    }
                    placeholder="Title"
                  />
                  <textarea
                    className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-sm text-[#111111]"
                    value={chapter.description}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      updateChapterDraft(chapter.id, "description", e.target.value)
                    }
                    placeholder="Description"
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    {moveChapter && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveChapter(index, index - 1);
                          }}
                          className="rounded p-1 hover:bg-white/10 disabled:opacity-30 text-[#111111]"
                          title="Move Up"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M12 19V5M5 12l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={index === orderedChapters.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveChapter(index, index + 1);
                          }}
                          className="rounded p-1 hover:bg-white/10 disabled:opacity-30 text-[#111111]"
                          title="Move Down"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M12 5v14M5 12l7 7 7-7" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChapter(chapter.id);
                      }}
                      className="rounded-sm border border-red-300 px-3 py-1 text-xs font-semibold text-red-500 hover:border-red-400"
                    >
                      Delete chapter
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(chapter.id);
                    }}
                    className="rounded-sm border border-[#999999] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#111111] hover:border-[#ff6a3a] hover:text-[#111111]"
                  >
                    {collapsedChapters[chapter.id] ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>
            </header>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#ff6a3a]">{chapter.kicker}</p>
              <h4 className="text-lg font-semibold text-[#111111]">{chapter.title}</h4>
              <p className="text-xs text-[#111111]">{chapter.description}</p>
            </div>
          )}

          {!collapsedChapters[chapter.id] && (
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
                    onUpdateGroup={(next) => onUpdateGroup(chapter.id, group.id, next)}
                    selectedMesh={activeMeshName}
                    onUpdateMeshVisibility={
                      activeMeshName && onUpdateOptionVisibility
                        ? (optionValue, visible) =>
                            onUpdateOptionVisibility(
                              chapter.id,
                              group.id,
                              optionValue,
                              activeMeshName,
                              visible
                            )
                        : undefined
                    }
                    getPrice={getPrice}
                    baselinePrice={getBaseline(group.id)}
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
                    getPrice={getPrice}
                    baselinePrice={getBaseline(group.id)}
                  />
                )
              )}
              {isDesignMode && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onAddGroup(chapter.id)}
                    className="rounded-sm border border-[#ff6a3a] bg-[#ff6a3a]/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6a3a] hover:border-[#ff6a3a]"
                  >
                    Add group
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {isDesignMode && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddChapter}
            className="rounded-sm border border-[#ff6a3a] bg-[#ff6a3a]/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6a3a] hover:border-[#ff6a3a]"
          >
            Add chapter
          </button>
        </div>
      )}
    </div>
  );
}


function HomeContent({
  config,
  classNames,
  initialMode,
  allowModeSwitch,
  onStateChange,
}: {
  config: Config;
  classNames?: Partial<HomeClassNames>;
  initialMode?: "design" | "preview";
  allowModeSwitch?: boolean;
  onStateChange?: (state: { selections: Record<string, string>; totalPrice: number, objectVisibility: Record<string, boolean> }) => void;
}) {
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
  const allowSwitch = allowModeSwitch ?? true;
  const defaultMode = initialMode ?? (allowSwitch ? "design" : "preview");

  const [mode, setMode] = useState<"design" | "preview">(defaultMode);
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
  const [optionModelTarget, setOptionModelTarget] = useState<{
    chapterId: string;
    groupId: string;
    optionValue: string;
  } | null>(null);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [isEmbedOpen, setIsEmbedOpen] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const matrixActive = isMatrixOpen && isDesignMode;
  const handleModeChange = useCallback(
    (nextMode: "design" | "preview") => {
      if (!allowSwitch) return;
      setMode(nextMode);
      if (nextMode === "preview") {
        setIsMatrixOpen(false);
        setIsPricingOpen(false);
      }
    },
    [allowSwitch]
  );
  const embedConfigPayload = useMemo(() => {
    const configCopy = {
      ...config,
      scene: {
        ...config.scene,
        model: {
          ...config.scene.model,
          src: sceneModel.src,
        },
      },
    };
    try {
      return encodeURIComponent(JSON.stringify(configCopy));
    } catch {
      return "";
    }
  }, [config, sceneModel.src]);
  const embedOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const embedSnippet = useMemo(() => {
    if (!embedOrigin) return "";
    const scriptUrl = `${embedOrigin}/embed-launcher.js`;
    return `<div id="configurator-embed"></div>\n<script src="${scriptUrl}" data-target="configurator-embed" data-model="${encodeURIComponent(
      sceneModel.src
    )}" data-config="${embedConfigPayload}" data-height="700"></script>`;
  }, [embedConfigPayload, embedOrigin, sceneModel.src]);
  const handleCopyEmbed = useCallback(() => {
    if (!embedSnippet) return;
    navigator.clipboard?.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 1500);
  }, [embedSnippet]);
  useEffect(() => {
    if (!isClient) return;
    const storedUrl = window.sessionStorage.getItem("droppedModelUrl");
    if (!storedUrl) return;
    setSceneModel((prev) => ({ ...prev, src: storedUrl }));
    setLocalModelUrl(storedUrl);
    setGltfScene(null);
    window.sessionStorage.removeItem("droppedModelUrl");
  }, [isClient]);
  const sidebarModelUrl = useMemo(() => resolveModelUrl(sceneModel.src), [sceneModel.src]);
  const meshTree = useMemo(() => {
    const scene = gltfScene;
    if (!scene) return [] as MeshTreeNode[];
    const counter = { current: 1 };
    return scene.children.map((child) => buildMeshTree(child, counter)).filter(Boolean) as MeshTreeNode[];
  }, [gltfScene]);
  const allMeshes = useMemo(() => flattenMeshNames(meshTree), [meshTree]);
  const [activeMeshName, setActiveMeshName] = useState<string | null>(null);

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

  const handleUpdateGroup = useCallback(
    (chapterId: string, groupId: string, next: { title: string; helper: string }) => {
      setChapters((prev) =>
        prev.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                groups: chapter.groups.map((group) =>
                  group.id === groupId ? { ...group, title: next.title, helper: next.helper } : group
                ),
              }
            : chapter
        )
      );
    },
    []
  );

  const startChapterEdit = useCallback((chapterId: string, chapter: Config["chapters"][number]) => {
    // no-op now that chapters are edited inline
  }, []);

  const cancelChapterEdit = useCallback((chapterId: string) => {
    // no-op
  }, []);

  const updateChapterDraft = useCallback(
    (chapterId: string, field: "kicker" | "title" | "description", value: string) => {
      setChapters((prev) =>
        prev.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                [field]: value,
              }
            : chapter
        )
      );
    },
    []
  );

  const saveChapterEdit = useCallback((chapterId: string) => {
    // no-op
  }, []);

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

  const [pricingRules, setPricingRules] = useState<Record<string, Record<string, number>>>(
    () => config.pricingRules ?? {}
  );

  // Initialize base prices from option.price if not present in pricingRules
  useEffect(() => {
    setPricingRules((prev) => {
      const next = { ...prev };
      let changed = false;
      orderedChapters.forEach((chapter) => {
        chapter.groups.forEach((group) => {
          group.options.forEach((option) => {
            if (!next[option.value]) {
              next[option.value] = {};
              changed = true;
            }
            if (next[option.value][option.value] === undefined) {
              next[option.value][option.value] = option.price ?? 0;
              changed = true;
            }
          });
        });
      });
      return changed ? next : prev;
    });
  }, []); // Run once on mount/config load

  const calculateOptionPrice = useCallback(
    (optionValue: string, currentSelections: Record<string, string>) => {
      const rules = pricingRules[optionValue];
      if (!rules) return 0;

      // 1. Base Price (Diagonal)
      let finalPrice = rules[optionValue] ?? 0;

      // 2. Check for overrides from selected dependencies
      // We iterate through all selected options. If a selected option is a dependency for this option (has a rule),
      // we apply it.
      // Conflict Resolution: "Latest wins" based on chapter/group order is ideal, but for now we just take the last one found
      // in the selections map iteration order, or we can rely on the user's "no conflicts" assumption.
      // To be safer, we can iterate through orderedChapters to find selected dependencies in order.
      
      // We need to find which selected options are dependencies.
      const selectedValues = Object.values(currentSelections);
      
      // Iterate in order to respect "waterfall" priority if we wanted to, but for now simple check.
      // Actually, let's iterate orderedChapters to find the *last* selected dependency to apply its override.
      
      let foundOverride = false;
      
      // We need to check dependencies in order.
      // But wait, the matrix is [Target][Dependency].
      
      for (const chapter of orderedChapters) {
        for (const group of chapter.groups) {
          const selectedInGroup = currentSelections[group.id];
          if (selectedInGroup && rules[selectedInGroup] !== undefined) {
             // This selected option has an override rule for our target option.
             // Since we iterate in order, this will overwrite previous ones, effectively implementing "Latest wins".
             finalPrice = rules[selectedInGroup];
             foundOverride = true;
          }
        }
      }

      return finalPrice;
    },
    [orderedChapters, pricingRules]
  );

  const totalPrice = useMemo(() => {
    let total = 0;
    orderedChapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        const selected = selections[group.id];
        if (selected) {
          total += calculateOptionPrice(selected, selections);
        }
      });
    });
    return total;
  }, [orderedChapters, selections, calculateOptionPrice]);

  

  const getOptionPrice = useCallback(
    (optionValue: string) => calculateOptionPrice(optionValue, selections),
    [calculateOptionPrice, selections]
  );

  const groupBaselines = useMemo(() => {
    const map: Record<string, number> = {};
    chapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        let min = Number.POSITIVE_INFINITY;
        group.options.forEach((opt) => {
          const price = calculateOptionPrice(opt.value, selections);
          if (price < min) min = price;
        });
        map[group.id] = Number.isFinite(min) ? min : 0;
      });
    });
    return map;
  }, [chapters, calculateOptionPrice, selections]);

  const handleUpdatePrice = useCallback(
    (targetId: string, dependencyId: string, price: number | undefined) => {
      setPricingRules((prev) => {
        const next = { ...prev };
        if (!next[targetId]) next[targetId] = {};
        if (price === undefined) {
          delete next[targetId][dependencyId];
        } else {
          next[targetId][dependencyId] = price;
        }
        return next;
      });
    },
    []
  );

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

  const priceBarBaseClasses =
    "flex flex-wrap items-center justify-between gap-3 text-sm text-[#111111]/80 shadow-2xl backdrop-blur";
  const renderPriceBar = (extraClasses: string) => (
    <div className={`${priceBarBaseClasses} ${extraClasses}`}>
      <div>
        <span className="text-xs uppercase tracking-[0.2em] text-[#111111]/50">Total</span>
        <span className="ml-2 text-lg font-semibold text-[#111111]">{currency.format(totalPrice)}</span>
      </div>
      <div className="flex items-center gap-2">
        {isDesignMode && (
          <button
            type="button"
            onClick={() => setIsEmbedOpen(true)}
            className="rounded-sm border border-[#999999] bg-white/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a]"
          >
            Embed
          </button>
        )}
        <button
          type="button"
          className="rounded-sm bg-[#ff6a3a] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#111111] shadow hover:bg-[#ff6a3a]"
        >
          Buy now
        </button>
      </div>
    </div>
  );

  const mobilePriceBar = (
    <div className="fixed inset-x-0 bottom-0 z-40 px-0 md:hidden">
      {renderPriceBar("rounded-none border-t border-[#999999] bg-[#e9e9e9] px-5 py-3")}
    </div>
  );

  const desktopPriceBar = (
    <div className="pointer-events-none absolute left-1/2 bottom-4 hidden -translate-x-1/2 md:block">
      <div className="pointer-events-auto w-full max-w-[480px] px-4">
        {renderPriceBar("rounded-sm border border-[#999999] bg-[#e9e9e9] px-5 py-3")}
      </div>
    </div>
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

    const handleScroll = () => {
      const markerY = window.innerHeight * 0.35;
      let nextFocus: SceneFocus | null = null;
      let nextChapterId: string | null = null;
      let closestDist = Number.POSITIVE_INFINITY;

      for (const chapter of orderedChapters) {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-chapter-id="${chapter.id}"]`)
        );
        let element: HTMLElement | null = null;
        for (const cand of candidates) {
          const r = cand.getBoundingClientRect();
          if (r.height > 1 && r.width > 1) {
            element = cand;
            break;
          }
        }
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const mid = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(mid - markerY);
        if (dist < closestDist) {
          closestDist = dist;
          nextChapterId = chapter.id;
          nextFocus = chapter.focus as SceneFocus;
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

    requestAnimationFrame(handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scroll", handleScroll);
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

  useEffect(() => {
    if (!activeMeshName && allMeshes.length > 0) {
      setActiveMeshName(allMeshes[0]);
    }
    if (activeMeshName && !allMeshes.includes(activeMeshName)) {
      setActiveMeshName(allMeshes[0] ?? null);
    }
  }, [allMeshes, activeMeshName]);

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

  useEffect(() => {
    onStateChange?.({ selections, totalPrice, objectVisibility });
  }, [selections, totalPrice, onStateChange]);

  const chaptersListProps = {
    orderedChapters,
    mode,
    mergedClasses,
    chapterRefs,
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
    onUpdateGroup: handleUpdateGroup,
    activeMeshName,
    onUpdateOptionVisibility: handleUpdateOptionVisibility,
    collapsedChapters,
    toggleCollapse: (chapterId: string) =>
      setCollapsedChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] })),
    moveChapter,
    getPrice: getOptionPrice,
    onAddChapter: addChapter,
    onDeleteChapter: deleteChapter,
    getBaseline: (groupId: string) => groupBaselines[groupId] ?? 0,
  };

  const content = (
    <div className="flex flex-col gap-6 pb-20 min-h-screen md:pb-0 md:h-screen md:grid md:grid-rows-[auto,1fr] md:gap-8">
      {allowSwitch && (
        <div className="flex items-center gap-1 p-1 text-xs uppercase tracking-[0.3em] text-[#111111] shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => handleModeChange("design")}
            className={`rounded-sm px-3 py-1.5 transition ${
              isDesignMode ? "bg-white text-[#111111] shadow" : "hover:bg-white/10"
            }`}
          >
            Design
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("preview")}
            className={`rounded-sm px-3 py-1.5 transition ${
              !isDesignMode ? "bg-white text-[#111111] shadow" : "hover:bg-white/10"
            }`}
          >
            Preview
          </button>
        </div>
      )}
      <section className={`${mergedClasses.heroSection}  overflow-auto pr-2`}>
        {isDesignMode ? (
          <div className="space-y-3 p-4">
            <input
              className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-sm uppercase tracking-[0.4em] text-[#111111]"
              value={hero.kicker}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setHero((prev) => ({ ...prev, kicker: e.target.value }))
              }
              placeholder="Kicker"
            />
            <input
              className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-3xl font-semibold text-[#111111]"
              value={hero.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setHero((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Title"
            />
            <div className="space-y-2">
              {hero.paragraphs.map((paragraph, index) => (
                <div key={index} className="flex items-start gap-2">
                  <textarea
                    className="w-full rounded-sm border border-[#999999] bg-[#e9e9e9] px-3 py-2 text-sm text-[#111111]"
                    value={paragraph}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      setHero((prev) => {
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
                      setHero((prev) => ({
                        ...prev,
                        paragraphs: prev.paragraphs.filter((_, i) => i !== index),
                      }))
                    }
                    className="rounded-sm border border-[#999999] px-3 py-1 text-xs text-[#111111] hover:border-red-300 hover:text-red-200"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setHero((prev) => ({ ...prev, paragraphs: [...prev.paragraphs, ""] }))
                }
                className="rounded-sm border border-[#ff6a3a]/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#ff6a3a] hover:border-[#ff6a3a]"
              >
                Add paragraph
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
          className={`${mergedClasses.canvasWrapper} flex h-[33vh] min-h-[280px] max-h-[70vh] flex-col transition-all duration-500 ease-in-out md:h-full md:min-h-0 md:max-h-none ${
            matrixActive ? "pointer-events-none opacity-0" : ""
          }`}
        >
          <div className="relative flex-1 min-h-0 w-full">
            {isDesignMode && activeChapter && activeFocusKey && (
              <div className="absolute left-0 top-0 z-30  h-full w-[300px]  p-3 text-[#111111] ">
                <div className="h-full p-3 rounded-sm border border-[#999999] bg-[#e9e9e9] flex flex-col shadow-2xl backdrop-blur">
                <div className="shrink-0 space-y-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[#111111]/60">
                    <span>Camera</span>
                    <span className="rounded-sm bg-white/10 px-2 py-0.5 text-[10px] text-[#ff6a3a]">
                      {activeFocusKey}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-[#111111]/80">
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
                          className="rounded-sm border border-[#999999] hover:border-[#ff6a3a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#111111] hover:bg-[#ff6a3a]/10 "
                        >
                          Change camera
                        </button>
                        {/* <button
                          type="button"
                          onClick={() => {
                            setIsMatrixOpen((prev) => !prev);
                            setIsPricingOpen(false);
                          }}
                          className={`rounded-sm border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                            isMatrixOpen
                              ? "bg-[#ff6a3a] text-[#111111] border-[#ff6a3a]"
                              : "border-[#999999] text-[#111111] hover:border-[#ff6a3a] hover:bg-[#ff6a3a]/10"
                          }`}
                        >
                          {isMatrixOpen ? "Close Model" : "Model"}
                        </button> */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsPricingOpen((prev) => !prev);
                            setIsMatrixOpen(false);
                          }}
                          className={`rounded-sm border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                            isPricingOpen
                              ? "bg-[#ff6a3a] text-[#111111] border-[#ff6a3a]"
                              : "border-[#999999] text-[#111111] hover:border-[#ff6a3a] hover:bg-[#ff6a3a]/10"
                          }`}
                        >
                          {isPricingOpen ? "Close Pricing" : "Pricing"}
                        </button>
                      </>
                    )}
                    {orbitEnabled && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-[#111111]/60">Use orbit to frame the shot.</p>
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
                            className="flex-1 rounded-sm border border-[#999999] bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#111111] hover:border-[#ff6a3a] hover:text-[#ff6a3a]"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={handleKeepCurrentView}
                            disabled={!orbitCameraState}
                            className={`flex-1 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] shadow ${
                              orbitCameraState
                                ? "bg-[#ff6a3a] text-[#111111] hover:bg-[#ff6a3a]"
                                : "bg-white/10 text-[#111111]/60"
                            }`}
                          >
                            Keep this view
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-[#111111]/50">
                    Stored for <span className="font-semibold text-[#111111]">{activeChapter.title}</span>.
                  </p>
                </div>
                {allMeshes.length > 0 && (
                  <div className="mt-3 flex-1 min-h-0 overflow-y-auto border-t border-[#999999]/40 pt-2">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#111111]/50">
                      Meshes
                    </p>
                    <ul className="space-y-0.5 text-[11px] font-mono text-[#111111]/80">
                      {allMeshes.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            onClick={() => setActiveMeshName(name)}
                            className={`w-full truncate text-left px-2 py-0.5 rounded-sm ${
                              activeMeshName === name
                                ? "bg-[#ff6a3a]/20 text-[#111111]"
                                : "hover:bg-white/60 text-[#111111]/80"
                            }`}
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
              </div>
            )}
            {isDesignMode && (
              <div className="absolute right-3 top-3 z-30 flex gap-2">
                <button
                  type="button"
                  onClick={handleUploadModelClick}
                  className="rounded-sm border border-[#999999] bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111111] shadow hover:border-[#ff6a3a] hover:text-[#ff6a3a]"
                >
                  Upload model
                </button>
                <button
                  type="button"
                  onClick={handleReplaceModel}
                  className="rounded-sm border border-[#999999] bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111111] shadow hover:border-[#ff6a3a] hover:text-[#ff6a3a]"
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
              mode={mode}
              freezeResize={matrixActive}
            />
            {desktopPriceBar}
          </div>
        </div>
      

      <div className="md:hidden px-6">
        <ChaptersList {...chaptersListProps} trackFocus />
      </div>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div
        className={mergedClasses.root}
        style={{
          backgroundImage: "url('/shape-9.87b97093.webp')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        {isClient && gltfScene === null && (
          <GltfSceneLoader url={sidebarModelUrl} onLoaded={(scene) => setGltfScene(scene)} />
        )}
        
        <div className="flex flex-col md:flex-row">
          <main className="flex-1 md:h-screen md:sticky md:top-0 md:overflow-y-auto no-scrollbar">
            {content}
          </main>
          <aside className="hidden md:flex w-1/3 shrink-0 flex-col gap-8 pl-6 bg-[#e9e9e9] backdrop-blur-sm">
            <ChaptersList {...chaptersListProps} trackFocus />
          </aside>
        </div>

        {matrixActive && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-black">
          <div className="relative flex-1 min-h-0 w-full">
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
              mode={mode}
              freezeResize={isMatrixOpen}
            />
          </div>
          <VisibilityMatrix
            isOpen={isMatrixOpen && isDesignMode}
            onClose={() => setIsMatrixOpen(false)}
            chapters={orderedChapters}
            meshTree={meshTree}
            onUpdateOptionVisibility={handleUpdateOptionVisibility}
          />
        </div>
      )}

      <PricingMatrix
        isOpen={isPricingOpen && isDesignMode}
        onClose={() => setIsPricingOpen(false)}
        chapters={orderedChapters}
        pricingRules={pricingRules}
        onUpdatePrice={handleUpdatePrice}
      />

        {mobilePriceBar}
        {isEmbedOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-10">
            <div className="mx-auto max-w-3xl space-y-4 rounded-3xl border border-white/10 bg-[#111111] p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-white">Embed snippet</h3>
                <button
                  type="button"
                  onClick={() => setIsEmbedOpen(false)}
                  className="rounded-sm border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white hover:border-white/40"
                >
                  Close
                </button>
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                Paste this block into your page and it will render the configurator with your model + config.
              </p>
              <textarea
                readOnly
                value={embedSnippet}
                className="min-h-[150px] w-full rounded-sm border border-white/10 bg-[#111111]/70 p-4 text-[11px] font-mono text-white"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyEmbed}
                  disabled={!embedSnippet}
                  className="rounded-sm bg-[#ff6a3a] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111111] shadow transition hover:bg-[#ff6a3a]/90 disabled:opacity-40"
                >
                  {embedCopied ? "Copied!" : "Copy snippet"}
                </button>
                <span className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                  Powered by <em>embed-launcher.js</em>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}

export default function Home({
  config: configProp,
  classNames,
  initialMode,
  allowModeSwitch,
  onStateChange,
}: HomeProps) {
  const baseConfig = useMemo(() => configProp ?? defaultConfig, [configProp]);
  const normalizedConfig = useMemo(() => normalizeConfigPrices(baseConfig), [baseConfig]);
  const configKey = useMemo(() => JSON.stringify(normalizedConfig), [normalizedConfig]);

  return (
    <HomeContent
      key={configKey}
      config={normalizedConfig}
      classNames={classNames}
      initialMode={initialMode}
      allowModeSwitch={allowModeSwitch}
      onStateChange={onStateChange}
    />
  );
}

export { defaultConfig, defaultClasses };
