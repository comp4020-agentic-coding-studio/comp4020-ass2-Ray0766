// The renderer, the scene and the three lights the first frame is made of.
//
// L0 in the loading order: geometry and lights, no network past the island
// chunk. That is the whole first frame, and it is what the 2 s Slow 4G budget
// is measured against, so nothing in here waits on a texture, a font or a
// fetch.
//
// Materials are made through `palette` rather than by hand so a theme flip
// repaints them. The scene has no colour of its own: every material holds the
// name of a `--at-*` token and re-reads it when the status bar's toggle fires.
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  Scene,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import type { ColourSource } from "./colours";

/** Materials that know which token they are, and repaint when it changes. */
export interface Palette {
  /** Lit. Lambert on purpose: one lighting model for the whole scene keeps the
   *  shader set — and so the chunk — as small as one scene can be. */
  lit(token: string, options?: { opacity?: number }): MeshLambertMaterial;
  /** Unlit. For rules, rims and anything that should not take the key light. */
  flat(token: string, options?: { opacity?: number }): MeshBasicMaterial;
  /** Re-reads every token. Called on a theme flip. */
  repaint(): void;
  dispose(): void;
}

export function createPalette(colours: ColourSource): Palette {
  const bound: { material: Material & { color: Color }; token: string }[] = [];

  const remember = <T extends Material & { color: Color }>(material: T, token: string): T => {
    material.color.setHex(colours.hex(token));
    bound.push({ material, token });
    return material;
  };

  return {
    lit(token, options) {
      const material = new MeshLambertMaterial(
        options?.opacity === undefined ? {} : { transparent: true, opacity: options.opacity },
      );
      return remember(material, token);
    },
    flat(token, options) {
      const material = new MeshBasicMaterial(
        options?.opacity === undefined ? {} : { transparent: true, opacity: options.opacity },
      );
      return remember(material, token);
    },
    repaint() {
      for (const entry of bound) entry.material.color.setHex(colours.hex(entry.token));
    },
    dispose() {
      for (const entry of bound) entry.material.dispose();
      bound.length = 0;
    },
  };
}

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  palette: Palette;
  /** The one light that breathes, so the loop can hold it still under reduced motion. */
  fill: PointLight;
  fillBaseIntensity: number;
  repaint(): void;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement, colours: ColourSource): Stage {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    // The stage is opaque: the page's own background is painted into the clear
    // colour from the same token the page uses, so there is nothing to blend
    // with and no alpha buffer to pay for.
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setClearColor(colours.hex("--at-bg"), 1);

  const scene = new Scene();
  scene.background = new Color(colours.hex("--at-bg"));

  const palette = createPalette(colours);

  // Ambient is the floor of the exposure; the directional is the key, thrown
  // from over the reader's left shoulder so the ring's near faces stay lit and
  // the far ones fall off — which is what makes a flat god view read as depth.
  //
  // Both of them are `--at-white`, and that is the rule rather than a shortcut:
  // a light's colour must not be a surface token. `--at-bg-elevated` is near
  // black in the dark theme and near white in the light one, so using it as the
  // ambient swung the exposure by two orders of magnitude between themes — the
  // light theme's floor came out at 255,255,254 against a 255,253,250
  // background, which is not a floor, it is a clipped white rectangle. Measured
  // at both viewports before this was changed. The surfaces carry the theme;
  // the lights carry the exposure.
  //
  // The intensities are set so an up-facing surface lands at about 0.94 of its
  // own token: the scene's colours are the page's colours, shaded, and nothing
  // clips in either theme. three's BRDF divides by π, hence the size of them.
  const ambient = new AmbientLight(colours.hex("--at-white"), 0.6);
  const key = new DirectionalLight(colours.hex("--at-white"), 3.0);
  key.position.set(-6, 12, 9);
  const fill = new PointLight(colours.hex("--at-primary"), 8, 40, 2);
  fill.position.set(0, 5.5, 0);
  scene.add(ambient, key, fill);

  const repaint = () => {
    renderer.setClearColor(colours.hex("--at-bg"), 1);
    (scene.background as Color).setHex(colours.hex("--at-bg"));
    ambient.color.setHex(colours.hex("--at-white"));
    key.color.setHex(colours.hex("--at-white"));
    fill.color.setHex(colours.hex("--at-primary"));
    palette.repaint();
  };

  return {
    renderer,
    scene,
    palette,
    fill,
    fillBaseIntensity: fill.intensity,
    repaint,
    dispose() {
      palette.dispose();
      renderer.dispose();
    },
  };
}

/** Free a subtree's geometry and materials. A room teardown that only removes
 *  the group leaves every buffer it uploaded on the GPU. */
export function releaseSubtree(root: { traverse(callback: (node: unknown) => void): void }): void {
  root.traverse((node) => {
    const mesh = node as Partial<Mesh> & { geometry?: BufferGeometry; material?: Material | Material[] };
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) for (const one of material) one.dispose();
    else material?.dispose();
  });
}
