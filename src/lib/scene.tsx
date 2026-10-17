import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react"
import type * as Fiber from "@react-three/fiber"
import type { OrbitControls as OrbitControlsClass } from "three/examples/jsm/controls/OrbitControls.js"
import { cn } from "@/lib/utils"
import { ClientOnly } from "@/lib/client-only"

// A 3D scene for an object that has real geometry (a part, a floor plan with
// heights, a stage, a building), drawn only in the browser with three.js via
// react-three-fiber. `children` is a FUNCTION returning r3f elements (<mesh>,
// <group>, <boxGeometry>…), so nothing three-specific is evaluated on the server:
//   <Scene ratio={16/9} camera={[4, 3, 6]}>{() => <mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="currentColor" /></mesh>}</Scene>
// Lights and orbit controls (three's OrbitControls) are provided; a tinted ground holds the box until mount.
export interface SceneProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  ratio?: number
  camera?: [number, number, number]
  controls?: boolean
  background?: string | null
  children?: ReactNode | (() => ReactNode)
}

export function Scene({ ratio = 16 / 9, camera = [4, 3, 6], controls = true, background = null, className, children, ...rest }: SceneProps) {
  return (
    <div data-slot="scene" className={cn("relative isolate w-full overflow-hidden bg-surface-sunken", className)} style={{ aspectRatio: String(ratio) }} {...rest}>
      <ClientOnly fallback={<div className="absolute inset-0" aria-hidden="true" />}>
        {() => <Three camera={camera} controls={controls} background={background}>{children}</Three>}
      </ClientOnly>
    </div>
  )
}

interface LoadedThree {
  fiber: typeof Fiber
  OrbitControls: typeof OrbitControlsClass
}

interface ThreeProps {
  camera: [number, number, number]
  controls: boolean
  background: string | null
  children?: ReactNode | (() => ReactNode)
}

function Three({ camera, controls, background, children }: ThreeProps) {
  const [mod, setMod] = useState<LoadedThree | null>(null)
  useEffect(() => {
    let live = true
    // three's own OrbitControls, not drei: drei's barrel is ~760 KB gz for this one control.
    Promise.all([import("@react-three/fiber"), import("three/examples/jsm/controls/OrbitControls.js")]).then(([fiber, oc]) => { if (live) setMod({ fiber, OrbitControls: oc.OrbitControls }) })
    return () => { live = false }
  }, [])
  if (!mod) return null
  const { Canvas } = mod.fiber
  return (
    <Canvas camera={{ position: camera, fov: 45 }} style={{ position: "absolute", inset: 0 }} dpr={[1, 2]}>
      {background ? <color attach="background" args={[background]} /> : null}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      {typeof children === "function" ? children() : children}
      {controls ? <Controls fiber={mod.fiber} OrbitControls={mod.OrbitControls} /> : null}
    </Canvas>
  )
}

// Orbit controls on the canvas' camera, damped, no pan; disposed with the canvas.
function Controls({ fiber, OrbitControls }: LoadedThree) {
  const { camera, gl, invalidate } = fiber.useThree()
  const [controls] = useState(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enablePan = false
    c.enableDamping = true
    return c
  })
  useEffect(() => {
    const onChange = () => invalidate()
    controls.addEventListener("change", onChange)
    return () => { controls.removeEventListener("change", onChange); controls.dispose() }
  }, [controls, invalidate])
  fiber.useFrame(() => controls.update())
  return null
}
