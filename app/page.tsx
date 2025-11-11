'use client';

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { MathUtils, Spherical, Vector3 } from "three";

type SceneFocus = "overview" | "detail";

const LOOK_AT = new Vector3(0, 0.6, 0);
const focusTargets: Record<
  SceneFocus,
  { radius: number; polar: number; azimuth: number }
> = {
  overview: {
    radius: 7,
    polar: MathUtils.degToRad(60),
    azimuth: MathUtils.degToRad(35),
  },
  detail: {
    radius: 7,
    polar: MathUtils.degToRad(52),
    azimuth: MathUtils.degToRad(-60),
  },
};

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

    temp.setFromSpherical(current).add(LOOK_AT);
    camera.position.copy(temp);
    camera.lookAt(LOOK_AT);
  });

  return null;
}

function SpinningBox() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.rotation.x = Math.sin(t * 0.6) * 0.18;
    meshRef.current.rotation.y = Math.sin(t * 0.4) * 0.2;
  });

  return (
    <mesh ref={meshRef} castShadow>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      {["#14b8a6", "#60a5fa", "#fbbf24", "#f472b6", "#34d399", "#f87171"].map(
        (color, index) => (
          <meshStandardMaterial
            attach={`material-${index}`}
            key={color}
            color={color}
            roughness={0.35}
            metalness={0.15}
          />
        )
      )}
    </mesh>
  );
}

type RadioOption = {
  label: string;
  description: string;
  value: string;
};

type ConfigRadioGroupProps = {
  title: string;
  helper: string;
  options: RadioOption[];
};

function ConfigRadioGroup({ title, helper, options }: ConfigRadioGroupProps) {
  const [value, setValue] = useState(options[0]?.value ?? "");
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
                onChange={() => setValue(option.value)}
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

function ConfiguratorCanvas({ focus }: { focus: SceneFocus }) {
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
      <CameraRig focus={focus} />
      <SpinningBox />
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <shadowMaterial opacity={0.25} />
      </mesh>
    </Canvas>
  );
}

const exteriorGroups: ConfigRadioGroupProps[] = [
  {
    title: "PAINT FINISH",
    helper: "Dial in the shell character by mixing matte and pearlescent coats.",
    options: [
      { label: "Glacier", description: "Cool pearl white base", value: "glacier" },
      { label: "Obsidian", description: "Low sheen matte black", value: "obsidian" },
      { label: "Copperline", description: "Burnished metallic orange", value: "copper" },
      { label: "Cerulean", description: "Deep electric blue", value: "cerulean" },
    ],
  },
  {
    title: "WHEEL DESIGN",
    helper: "Pick spoke geometry engineered for airflow and brake cooling.",
    options: [
      { label: "Vortex", description: "Turbine-inspired", value: "vortex" },
      { label: "Segment", description: "Five-spoke classic", value: "segment" },
      { label: "Ribbon", description: "Ultra-light carbon", value: "ribbon" },
      { label: "Halo", description: "Full dish aero", value: "halo" },
    ],
  },
  {
    title: "ROOF PROFILE",
    helper: "Balance transparency and acoustic insulation.",
    options: [
      { label: "Panorama", description: "Electrochromic glass", value: "panorama" },
      { label: "Contour", description: "Tinted structural ridge", value: "contour" },
      { label: "Stealth", description: "Carbon blackout", value: "stealth" },
    ],
  },
  {
    title: "LIGHT SIGNATURE",
    helper: "Define the character line for the running lights.",
    options: [
      { label: "Pulse", description: "Animated sequential", value: "pulse" },
      { label: "Compass", description: "Horizontal + vertical beams", value: "compass" },
      { label: "Crescent", description: "Swept arc motif", value: "crescent" },
    ],
  },
  {
    title: "BADGING",
    helper: "Match the trim and finish to your story.",
    options: [
      { label: "Chrome", description: "Classic mirror finish", value: "chrome" },
      { label: "Shadow", description: "Smoked aluminum", value: "shadow" },
      { label: "Copper", description: "Warm metallic accent", value: "badge-copper" },
    ],
  },
];

const dynamicGroups: ConfigRadioGroupProps[] = [
  {
    title: "DRIVE MODE",
    helper: "Shape throttle, damping, and aero mapping.",
    options: [
      { label: "Tour", description: "Comfort-first response", value: "tour" },
      { label: "Vector", description: "Adaptive daily tuning", value: "vector" },
      { label: "Pulse", description: "Track telemetry lock", value: "pulse-mode" },
    ],
  },
  {
    title: "STEERING FEEL",
    helper: "Blend rack ratio with active rear steer.",
    options: [
      { label: "Feather", description: "Light, long distance biased", value: "feather" },
      { label: "Balance", description: "Neutral resistance", value: "balance" },
      { label: "Carbon", description: "High feedback sport", value: "carbon" },
    ],
  },
  {
    title: "SUSPENSION",
    helper: "Control ride height and magnetorheological damping.",
    options: [
      { label: "Adaptive", description: "Self-leveling every 4ms", value: "adaptive" },
      { label: "Apex", description: "Low stance + stiff damper", value: "apex" },
      { label: "Summit", description: "Raised for rough surfaces", value: "summit" },
    ],
  },
  {
    title: "ASSIST SUITE",
    helper: "Tune how much autonomy overlays the drive.",
    options: [
      { label: "Guardian", description: "Hands-on augmented HUD", value: "guardian" },
      { label: "Pilot", description: "Level 3 commute focus", value: "pilot" },
      { label: "Off", description: "Pure mechanical control", value: "off" },
    ],
  },
];

export default function Home() {
  const [focus, setFocus] = useState<SceneFocus>("overview");
  const exteriorRef = useRef<HTMLDivElement | null>(null);
  const dynamicsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sections = [
      { ref: exteriorRef, focus: "overview" as SceneFocus },
      { ref: dynamicsRef, focus: "detail" as SceneFocus },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const hit = sections.find((section) => section.ref.current === entry.target);
            if (hit) {
              setFocus(hit.focus);
            }
          }
        });
      },
      { threshold: 0.4 }
    );

    sections.forEach(({ ref }) => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-slate-950 text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-24 px-6 py-16">
        <section className="space-y-10 text-lg leading-relaxed text-slate-200">
          <p className="text-sm uppercase tracking-[0.5em] text-teal-200">
            Automata Concept Lab
          </p>
          <h1 className="text-4xl font-semibold text-white sm:text-6xl">
            A four-act journey through a configurable 3D concept build
          </h1>
          <p>
            Designing an expressive machine requires more than a static hero shot. This hero section
            behaves like any editorial page. Scroll, skim, or read every line: the intent is to set
            the tone and explain why we obsess over digital craftsmanship before the first bolt ever
            exists in the real world.
          </p>
          <p>
            Our configurator is split into chapters. First, we cover narrative and vision: the ethos
            behind the Automata bodywork, the raw sketches, and the material palette. We talk about
            proportion, stance, aerodynamic management, and the ergonomic cues that allow the cabin
            to feel both lounge-like and purposeful. We also outline the sound design philosophy, the
            robotics-inspired HMI, and the sustainability roadmap for low-volume production.
          </p>
          <p>
            Next, you will see the canvas nestle into the top of the viewport. That section focuses
            purely on exterior storytelling. Radios below the sticky scene let you experiment with
            finishes, lighting, wheels, and trim to understand how small tweaks alter the emotional
            read of the object. Every option has been previsualized so the transitions feel cohesive.
          </p>
          <p>
            After that, we pivot—literally. The camera glides to a new vantage point highlighting
            aerodynamics, cooling, and chassis geometry. The scrolling content now covers dynamic
            systems: drive modes, steering ratios, ride height, and assist levels. You always see the
            object responding to your scroll position, so context remains intact while you make
            decisions.
          </p>
          <p>
            Finally, we return to a traditional narrative layout that wraps everything with launch
            plans, partnership opportunities, and a CTA for deeper collaboration. Each section feels
            intentional, and the pacing mirrors a studio walkthrough where you can pause and explore.
          </p>
        </section>

        <section className="space-y-16" aria-label="Configurator chapters">
          <div className="sticky top-0 z-20 h-[33vh] min-h-[280px] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
            <ConfiguratorCanvas focus={focus} />
          </div>
          <div
            ref={exteriorRef}
            className="space-y-8 pb-32"
            aria-label="Exterior configuration focus"
          >
            <header className="space-y-3">
              <p className="text-sm uppercase tracking-[0.4em] text-teal-200">Chapter 02</p>
              <h2 className="text-3xl font-semibold">Exterior Identity Stack</h2>
              <p className="text-base text-white/70">
                Lock in the silhouette before moving to dynamics. Each radio menu represents a visual
                micro-decision that would normally require a render farm—here it is immediate.
              </p>
            </header>
            <div className="space-y-6">
              {exteriorGroups.map((group) => (
                <ConfigRadioGroup key={group.title} {...group} />
              ))}
            </div>
          </div>
          <div
            ref={dynamicsRef}
            className="space-y-8 pb-32"
            aria-label="Dynamics configuration focus"
          >
            <header className="space-y-3">
              <p className="text-sm uppercase tracking-[0.4em] text-teal-200">Chapter 03</p>
              <h2 className="text-3xl font-semibold">Dynamics, Feel, & Systems</h2>
              <p className="text-base text-white/70">
                The camera drifts toward the aero channels and intake surfaces, hinting at what
                changes as you tune the digital chassis. Everything remains the same scene—only the
                vantage point shifts to prioritize motion cues.
              </p>
            </header>
            <div className="space-y-6">
              {dynamicGroups.map((group) => (
                <ConfigRadioGroup key={group.title} {...group} />
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-8 pb-24 text-lg leading-relaxed text-slate-200">
          <p className="text-sm uppercase tracking-[0.4em] text-teal-200">Chapter 04</p>
          <h2 className="text-3xl font-semibold text-white">Launch narrative & closing remarks</h2>
          <p>
            With the heavy lifting done, this final block returns to traditional scrolling content.
            Here we outline go-to-market considerations, homologation pathways, and fabrication
            partners. The sticky scene releases, reminding visitors they are back in the narrative
            world and ready for next steps.
          </p>
          <p>
            We typically pair this section with press-ready copy, executive quotes, and a lead form.
            Because you just walked through an interactive story, the conversation starters here are
            already elevated—whether you are pitching an investor, onboarding a supplier, or inviting
            early adopters.
          </p>
          <p>
            Want to take it further? Swap the box for your asset, stream CMS-driven attributes into
            the radio menus, and connect the selections to a pricing or BOM table. The framework is
            ready for production; this page simply proves the interactions feel intuitive before you
            scale.
          </p>
        </section>
      </main>
    </div>
  );
}
