{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE QuasiQuotes       #-}

module Interop where

import Miso (DOMRef, MisoString)
import Miso.FFI.QQ (js)

initializeWebGPU :: MisoString -> DOMRef -> IO ()
initializeWebGPU exampleId canvas =
  [js|
    import('/assets/static/webgpu/runtime.js')
      .then(runtime => runtime.initialize(${canvas}, ${exampleId}))
      .catch(error => console.error('WebGPU initialization failed', error));
  |]

renderWebGPU :: IO ()
renderWebGPU =
  [js|
    import('/assets/static/webgpu/runtime.js')
      .then(runtime => runtime.render())
      .catch(error => console.error('WebGPU render failed', error));
  |]

destroyWebGPU :: DOMRef -> IO ()
destroyWebGPU canvas =
  [js|
    import('/assets/static/webgpu/runtime.js')
      .then(runtime => runtime.destroy(${canvas}))
      .catch(error => console.error('WebGPU cleanup failed', error));
  |]
