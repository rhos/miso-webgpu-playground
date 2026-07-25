-----------------------------------------------------------------------------
{-# LANGUAGE CPP               #-}
{-# LANGUAGE LambdaCase        #-}
{-# LANGUAGE OverloadedStrings #-}
-----------------------------------------------------------------------------
module Main where
-----------------------------------------------------------------------------
import qualified Interop as I
import           Miso
import           Miso.Html.Element as H
import           Miso.Html.Property as P
import qualified Miso.Event as E
import qualified Miso.CSS as CSS
import           Miso.CSS (StyleSheet)
-----------------------------------------------------------------------------
data Action
  = InitializeWebGPU DOMRef
  deriving (Eq)
-----------------------------------------------------------------------------
#ifdef WASM
#ifndef INTERACTIVE
foreign export javascript "hs_start" main :: IO ()
#endif
#endif
-----------------------------------------------------------------------------
main :: IO ()
#ifdef INTERACTIVE
main = reload defaultEvents app
#else
main = startApp defaultEvents app
#endif
-----------------------------------------------------------------------------
app :: App () Action
app = (component () updateModel viewModel)
  { styles = [ Sheet sheet ]
  }
-----------------------------------------------------------------------------

updateModel :: Action -> Effect parent props () Action
updateModel = \case
  InitializeWebGPU canvas ->
    io_ $ I.initializeWebGPU canvas

-----------------------------------------------------------------------------
viewModel :: props -> () -> View () Action
viewModel _ _ = H.div_
  [ P.class_ "playground" ]
  [ H.h1_
    [ P.class_ "playground-title"
    ]
    [ "WebGPU playground"
    ]
  , H.div_
    [ P.id_ "webgpu-viewport"
    , P.class_ "webgpu-viewport"
    ]
    [ H.canvas_
      [ P.id_ "webgpu-canvas"
      , P.class_ "webgpu-canvas"
      , E.onCreatedWith InitializeWebGPU
      ]
      []
    ]
  ]
-----------------------------------------------------------------------------
sheet :: StyleSheet
sheet =
  CSS.sheet_
  [ CSS.selector_ ":root"
    [ "--background" =: "#0f172a"
    , "--surface" =: "#111827"
    , "--border" =: "#334155"
    , "--text-color" =: "#e2e8f0"
    ]
  , CSS.selector_ "body"
    [ CSS.fontFamily "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    , CSS.margin "0"
    , CSS.backgroundColor (CSS.var "background")
    , CSS.color (CSS.var "text-color")
    ]
  , CSS.selector_ ".playground"
    [ CSS.boxSizing "border-box"
    , CSS.display "flex"
    , CSS.flexDirection "column"
    , CSS.gap (CSS.rem 1)
    , CSS.width "100vw"
    , CSS.height "100vh"
    , CSS.padding (CSS.rem 1.5)
    ]
  , CSS.selector_ ".playground-title"
    [ CSS.fontSize (CSS.rem 1.25)
    , CSS.margin "0"
    ]
  , CSS.selector_ ".webgpu-viewport"
    [ CSS.flex "1"
    , CSS.minHeight "0"
    , CSS.width "100%"
    , CSS.overflow "hidden"
    , CSS.backgroundColor (CSS.var "surface")
    , CSS.border "1px solid var(--border)"
    , CSS.borderRadius (CSS.rem 0.25)
    ]
  , CSS.selector_ ".webgpu-canvas"
    [ CSS.display "block"
    , CSS.width "100%"
    , CSS.height "100%"
    ]
  ]
-----------------------------------------------------------------------------
