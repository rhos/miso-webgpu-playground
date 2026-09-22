{-# LANGUAGE CPP               #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE QuasiQuotes       #-}

module Interop where

import Miso (DOMRef, MisoString)
import Miso.FFI.QQ (js)

runtimePath :: MisoString
#ifdef INTERACTIVE
runtimePath = "/assets/static/webgpu/runtime.js"
#else
runtimePath = "/webgpu/runtime.js"
#endif

runtimeReload :: MisoString
runtimeReload = "reload"

initializeWebGPU :: MisoString -> DOMRef -> IO ()
initializeWebGPU exampleId canvas =
  [js|
    import(${runtimePath} + '?reload=' + ${runtimeReload})
      .then(runtime => runtime.initialize(${canvas}, ${exampleId}))
      .catch(error => console.error('WebGPU initialization failed', error));
  |]

renderWebGPU :: IO ()
renderWebGPU =
  [js|
    import(${runtimePath} + '?reload=' + ${runtimeReload})
      .then(runtime => runtime.render())
      .catch(error => console.error('WebGPU render failed', error));
  |]

changeTextureSettings
  :: MisoString
  -> MisoString
  -> MisoString
  -> MisoString
  -> Double
  -> IO ()
changeTextureSettings addressModeU addressModeV magFilter minFilter scale =
  [js|
    import(${runtimePath} + '?reload=' + ${runtimeReload})
      .then(runtime => runtime.changeSettings({
        addressModeU: ${addressModeU},
        addressModeV: ${addressModeV},
        magFilter: ${magFilter},
        minFilter: ${minFilter},
        scale: ${scale}
      }))
      .catch(error => console.error('WebGPU settings update failed', error));
  |]

destroyWebGPU :: DOMRef -> IO ()
destroyWebGPU canvas =
  [js|
    import(${runtimePath} + '?reload=' + ${runtimeReload})
      .then(runtime => runtime.destroy(${canvas}))
      .catch(error => console.error('WebGPU cleanup failed', error));
  |]
