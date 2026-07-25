{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE QuasiQuotes       #-}

module Interop where

import Miso.FFI.QQ (js)
import Miso (DOMRef)

initializeWebGPU :: DOMRef -> IO ()
initializeWebGPU canvas =
  [js|
    import('/assets/static/interop/render.js?reload=' + Date.now())
      .then(renderer => renderer.run(${canvas}))
      .catch(error => console.error('WebGPU initialization failed', error));
  |]
