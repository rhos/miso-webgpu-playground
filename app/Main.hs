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
import qualified Miso.Html.Event as HE
import qualified Miso.CSS as CSS
import           Miso.CSS (StyleSheet)
-----------------------------------------------------------------------------
data Example
  = Triangle
  | Compute
  deriving (Eq)
-----------------------------------------------------------------------------
newtype Model = Model
  { selectedExample :: Example
  }
  deriving (Eq)
-----------------------------------------------------------------------------
data Action
  = SelectExample Example
  | InitializeWebGPU Example DOMRef
  | DestroyWebGPU DOMRef
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
app :: App Model Action
app = (component initialModel updateModel viewModel)
  { styles = [ Sheet sheet ]
  }
-----------------------------------------------------------------------------
initialModel :: Model
initialModel = Model
  { selectedExample = Triangle
  }
-----------------------------------------------------------------------------

updateModel :: Action -> Effect parent props Model Action
updateModel = \case
  SelectExample example ->
    modify $ \model -> model { selectedExample = example }
  InitializeWebGPU example canvas ->
    io_ $ I.initializeWebGPU (exampleId example) canvas
  DestroyWebGPU canvas ->
    io_ $ I.destroyWebGPU canvas

-----------------------------------------------------------------------------
viewModel :: props -> Model -> View Model Action
viewModel _ model = H.div_
  [ P.class_ "playground" ]
  [ H.header_
    [ P.class_ "playground-header"
    ]
    [ H.h1_
      [ P.class_ "playground-title"
      ]
      [ "WebGPU playground"
      ]
    , H.nav_
      [ P.class_ "example-list"
      ]
      [ exampleButton (selectedExample model) example
      | example <- examples
      ]
    ]
  , H.div_
    [ P.id_ "webgpu-viewport"
    , P.class_ "webgpu-viewport"
    ]
    [ H.canvas_
      [ key_ (exampleId (selectedExample model))
      , P.id_ "webgpu-canvas"
      , P.class_ "webgpu-canvas"
      , E.onCreatedWith (InitializeWebGPU (selectedExample model))
      , E.onBeforeDestroyedWith DestroyWebGPU
      ]
      []
    ]
  ]
-----------------------------------------------------------------------------
examples :: [Example]
examples =
  [ Triangle
  , Compute
  ]
-----------------------------------------------------------------------------
exampleId :: Example -> MisoString
exampleId = \case
  Triangle -> "triangle"
  Compute -> "compute"
-----------------------------------------------------------------------------
exampleLabel :: Example -> MisoString
exampleLabel = \case
  Triangle -> "Triangle"
  Compute -> "Compute"
-----------------------------------------------------------------------------
exampleButton :: Example -> Example -> View Model Action
exampleButton selected example = H.button_
  [ P.class_ $
      if selected == example
        then "example-button example-button--active"
        else "example-button"
  , HE.onClick (SelectExample example)
  ]
  [ text (exampleLabel example)
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
  , CSS.selector_ ".playground-header"
    [ CSS.display "flex"
    , CSS.alignItems "center"
    , CSS.gap (CSS.rem 1)
    ]
  , CSS.selector_ ".example-list"
    [ CSS.display "flex"
    , CSS.gap (CSS.rem 0.5)
    ]
  , CSS.selector_ ".example-button"
    [ CSS.padding "0.35rem 0.65rem"
    , CSS.border "1px solid var(--border)"
    , CSS.borderRadius (CSS.rem 0.25)
    , CSS.backgroundColor (CSS.var "surface")
    , CSS.color (CSS.var "text-color")
    , CSS.cursor "pointer"
    ]
  , CSS.selector_ ".example-button--active"
    [ CSS.borderColor $ CSS.var "#60a5fa"
    , CSS.backgroundColor $ CSS.var "#1e3a5f"
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
