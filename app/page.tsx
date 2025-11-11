'use client';

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { MathUtils, Spherical, Vector3 } from "three";
import { useGLTF } from "@react-three/drei";

import configurator from "@/config/configurator.json";

type RadioOption = {
  label: string;
  description: string;
  value: string;
  visibility?: Record<string, boolean>;
};

type ConfiguratorGroup = {
  id: string;
  title: string;
  helper: string;
  options: RadioOption[];
};

type ConfigRadioGroupProps = ConfiguratorGroup & {
  value: string;
  onChange: (value: string) => void;
};

type FocusTargetConfig = {
  radius: number;
  polarDeg: number;
  azimuthDeg: number;
  lookAt: [number, number, number];
};

type SceneObjectConfig = {
  id: string;
  src: string;
  position: [number, number, number];
  rotationDeg?: [number, number, number];
  scale?: [number, number, number];
};

type Config = {
  hero: {
    kicker: string;
    title: string;
    paragraphs: string[];
  };
  scene: {
    focusTargets: Record<string, FocusTargetConfig>;
    objects: SceneObjectConfig[];
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

const config = configurator as unknown as Config;
type SceneFocus = keyof Config["scene"]["focusTargets"];

const focusTargets = Object.entries(config.scene.focusTargets).reduce(
  (acc, [key, value]) => {
    acc[key as SceneFocus] = {
      radius: value.radius,
      polar: MathUtils.degToRad(value.polarDeg),
      azimuth: MathUtils.degToRad(value.azimuthDeg),
      lookAt: new Vector3(...value.lookAt),
    };
    return acc;
  },
  {} as Record<SceneFocus, { radius: number; polar: number; azimuth: number; lookAt: Vector3 }>
);

const focusKeys = Object.keys(focusTargets) as SceneFocus[];
const defaultFocus =
  (config.chapters[0]?.focus as SceneFocus | undefined) ??
  focusKeys[0] ??
  ("overview" as SceneFocus);

function CameraRig({ focus }: { focus: SceneFocus }) {
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
  }, [focus]);

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

function SceneObject({ object }: { object: SceneObjectConfig }) {
  const gltf = useGLTF(object.src);
  const instance = useMemo(() => gltf.scene.clone(), [gltf.scene]);

  const rotation = useMemo(() => {
    const [x = 0, y = 0, z = 0] = object.rotationDeg ?? [0, 0, 0];
    return [MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z)] as [
      number,
      number,
      number,
    ];
  }, [object]);

  return (
    <primitive
      object={instance}
      position={object.position}
      rotation={rotation}
      scale={object.scale ?? [1, 1, 1]}
      castShadow
      receiveShadow
    />
  );
}

function SceneObjects({
  objects,
  visibility,
}: {
  objects: SceneObjectConfig[];
  visibility: Record<string, boolean | undefined>;
}) {
  if (!objects.length) return null;

  return (
    <>
      {objects
        .filter((object) => visibility[object.id] !== false)
        .map((object) => (
          <SceneObject key={object.id} object={object} />
        ))}
    </>
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

function ConfiguratorCanvas({
  focus,
  objects,visibility
}: {
  focus: SceneFocus;
  objects: SceneObjectConfig[];
  visibility: Record<string, boolean | undefined>;
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
        <CameraRig focus={focus} />
        <SceneObjects objects={objects} visibility={visibility} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      </Suspense>
    </Canvas>
  );
}

export default function Home() {
  const [focus, setFocus] = useState<SceneFocus>(defaultFocus);
  const focusRef = useRef<SceneFocus>(defaultFocus);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    config.chapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        initial[group.id] = group.options[0]?.value ?? "";
      });
    });
    return initial;
  });

  useEffect(() => {
    if (!config.chapters.length) return;

    const handleScroll = () => {
      const markerY = window.innerHeight * 0.35;
      let nextFocus: SceneFocus | null = null;

      for (const chapter of config.chapters) {
        const element = chapterRefs.current[chapter.id];
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top <= markerY && rect.bottom >= markerY) {
          nextFocus = chapter.focus as SceneFocus;
          break;
        }
      }

      if (nextFocus && nextFocus !== focusRef.current) {
        focusRef.current = nextFocus;
        setFocus(nextFocus);
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const objectVisibility = useMemo(() => {
    const map: Record<string, boolean> = {};
    config.chapters.forEach((chapter) => {
      chapter.groups.forEach((group) => {
        const selectedValue = selections[group.id];
        const option = group.options.find((opt) => opt.value === selectedValue);
        if (option?.visibility) {
          Object.entries(option.visibility).forEach(([objectId, state]) => {
            map[objectId] = state;
          });
        }
      });
    });
    return map;
  }, [selections]);

  return (
    <div className="bg-slate-950 text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-24 px-6 py-16">
        <section className="space-y-10 text-lg leading-relaxed text-slate-200">
          <p className="text-sm uppercase tracking-[0.5em] text-teal-200">{config.hero.kicker}</p>
          <h1 className="text-4xl font-semibold text-white sm:text-6xl">{config.hero.title}</h1>
          {config.hero.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>

        <section className="space-y-16" aria-label="Configurator chapters">
          <div className="sticky top-0 z-20 h-[33vh] min-h-[280px] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
            <ConfiguratorCanvas
              focus={focus}
              objects={config.scene.objects}
              visibility={objectVisibility}
            />
          </div>
          {config.chapters.map((chapter) => (
            <div
              key={chapter.id}
              ref={(node) => {
                chapterRefs.current[chapter.id] = node;
              }}
              className="space-y-8 pb-32"
              aria-label={`${chapter.title} configuration focus`}
            >
              <header className="space-y-3">
                <p className="text-sm uppercase tracking-[0.4em] text-teal-200">{chapter.kicker}</p>
                <h2 className="text-3xl font-semibold">{chapter.title}</h2>
                <p className="text-base text-white/70">{chapter.description}</p>
              </header>
              <div className="space-y-6">
                {chapter.groups.map((group) => (
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
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-8 pb-24 text-lg leading-relaxed text-slate-200">
          <p className="text-sm uppercase tracking-[0.4em] text-teal-200">{config.closing.kicker}</p>
          <h2 className="text-3xl font-semibold text-white">{config.closing.title}</h2>
          {config.closing.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      </main>
    </div>
  );
}

config.scene.objects.forEach((object) => {
  useGLTF.preload(object.src);
});
