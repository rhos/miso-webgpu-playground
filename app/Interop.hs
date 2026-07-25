{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE QuasiQuotes       #-}

module Interop where

import Miso.FFI.QQ (js)

initializeWebGPU :: IO ()
initializeWebGPU =
  [js|
    import('/assets/static/interop/render.js?reload=' + Date.now())
      .then(renderer => renderer.main())
      .catch(error => console.error('WebGPU initialization failed', error));
  |]
