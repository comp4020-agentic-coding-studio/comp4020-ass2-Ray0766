// Everything that arrives after the first frame.
//
// L0 — geometry and lights — is already on screen by the time anything in here
// runs, and that is the deal: the first frame owes the network nothing past the
// island chunk, and every layer above it attaches when it arrives. Each of
// these three can come back empty, and empty is a normal outcome rather than an
// error state. A still that never lands leaves the frame its flat fill; a model
// that never lands leaves the procedural stand-in standing. Nothing here
// reserves space for a thing that has not come and nothing flashes when it does.
//
// The one rule the callers do not have to remember: only one clip holds a
// decoder. A `play()` releases whichever handle was playing, so six screens on
// a wall cannot quietly end up with six video elements decoding at once even if
// a room forgets to call `release`.
import { SRGBColorSpace, TextureLoader, VideoTexture, type Object3D, type Texture } from "three";
import type { LayerApi, VideoHandle } from "./types";

export interface Layers extends LayerApi {
  /**
   * L2 for something that is not a piece: a door's window.
   *
   * `LayerApi.video` takes a `BacklotPiece` because a room's clips are pieces on
   * a wall. A door's clip is named by its `DoorWindow` and there is no piece
   * behind it, and synthesising a fake piece to get at the same three lines
   * would be a shape invented to satisfy a signature. Same decoder, same
   * one-at-a-time rule: this and `video` share `playing`, so a door's clip and a
   * wall's clip can no more run at once than two of either can.
   */
  videoFile(file: string): VideoHandle;
  /**
   * How many decoders are alive right now.
   *
   * Alive, not started and not drawing: a paused `<video>` still holds one, and
   * "stopped drawing" is not "let go". This counts handles that still have an
   * element with a source on it, which is the thing `release` actually takes
   * away — so a check can assert that walking away from a door left nothing
   * behind rather than asserting that the picture stopped moving.
   */
  liveCount(): number;
  /** Free every decoder without throwing away the stills. Run when a room is
   *  unmounted, so a room that forgot its own `release` cannot leave one
   *  playing behind a hub nobody can see it from. */
  releaseVideos(): void;
  dispose(): void;
}

export function createLayers(assetPrefix: string): Layers {
  const loader = new TextureLoader();
  const loaded = new Set<Texture>();
  type Handle = VideoHandle & { release(): void; held(): boolean };
  const handles = new Set<Handle>();
  let playing: Handle | null = null;

  function resolve(file: string): string {
    // Already base-resolved by the page; the island never calls withBase and
    // never writes a root-absolute URL (CLAUDE.md §4).
    return `${assetPrefix}${file}`;
  }

  function makeVideo(file: string): VideoHandle & { release(): void; held(): boolean } {
    let element: HTMLVideoElement | null = null;
    let texture: VideoTexture | null = null;
    let live = false;

    const handle = {
      get texture() {
        return texture;
      },
      get playing() {
        return live;
      },
      /** Whether this handle is holding a decoder, which is not the same
       *  question as whether it is playing one. */
      held() {
        return element !== null;
      },
      async play() {
        if (playing && playing !== handle) playing.release();
        playing = handle;
        if (!element) {
          element = document.createElement("video");
          element.src = resolve(file);
          element.muted = true;
          element.loop = true;
          element.playsInline = true;
          element.preload = "auto";
          texture = new VideoTexture(element);
          texture.colorSpace = SRGBColorSpace;
        }
        try {
          await element.play();
          live = true;
        } catch {
          // Autoplay refused, or the file is not there. The poster stays up,
          // which is the layer below holding its ground.
          live = false;
        }
      },
      pause() {
        element?.pause();
        live = false;
      },
      release() {
        live = false;
        if (playing === handle) playing = null;
        texture?.dispose();
        texture = null;
        if (element) {
          element.pause();
          // Emptying the source is what actually frees the decoder; pausing
          // alone leaves it allocated, and a wall of clips runs a browser out
          // of them.
          element.removeAttribute("src");
          element.load();
          element = null;
        }
      },
    };

    handles.add(handle);
    return handle;
  }

  return {
    texture(file) {
      return new Promise<Texture | null>((settle) => {
        loader.load(
          resolve(file),
          (texture) => {
            texture.colorSpace = SRGBColorSpace;
            loaded.add(texture);
            settle(texture);
          },
          undefined,
          () => settle(null),
        );
      });
    },

    video(piece) {
      return makeVideo(piece.file);
    },

    videoFile(file) {
      return makeVideo(file);
    },

    liveCount() {
      let alive = 0;
      for (const handle of handles) if (handle.held()) alive += 1;
      return alive;
    },

    async model(url): Promise<Object3D | null> {
      try {
        // Dynamic on purpose: this is the only `examples/` import in the whole
        // island and it is a chunk of its own, so it costs nothing until a room
        // actually asks for a model. A static import would put the loader, and
        // everything it pulls in, inside the 200 kB the first frame is measured
        // against.
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const gltf = await new GLTFLoader().loadAsync(url);
        return gltf.scene;
      } catch {
        return null;
      }
    },

    releaseVideos() {
      for (const handle of handles) handle.release();
      handles.clear();
      playing = null;
    },

    dispose() {
      for (const handle of handles) handle.release();
      handles.clear();
      for (const texture of loaded) texture.dispose();
      loaded.clear();
      playing = null;
    },
  };
}
