-----------------------------------------------------------------------------
{-# LANGUAGE LambdaCase        #-}
{-# LANGUAGE OverloadedStrings #-}
-----------------------------------------------------------------------------
module Examples.CircleVBSettings
  ( component
  , sheet
  ) where
-----------------------------------------------------------------------------
import           Miso hiding (component)
import qualified Miso as Miso
import qualified Miso.CSS as CSS
import           Miso.CSS (StyleSheet)
import           Miso.Html.Element as H
import qualified Miso.Html.Property as P
-----------------------------------------------------------------------------
component :: Component parent () () ()
component = Miso.component () noop viewModel

viewModel :: () -> () -> View () ()
viewModel _ _ = H.pre_
  [ P.id_ "circle-vb-output"
  , P.class_ "circle-vb-output"
  ]
  []

-----------------------------------------------------------------------------
sheet :: StyleSheet
sheet =
  CSS.sheet_
  [ CSS.selector_ ".circle-vb-output"
    [ "position" =: "absolute"
    , "top" =: "0.75rem"
    , "left" =: "0.75rem"
    , "z-index" =: "1"
    , CSS.boxSizing "border-box"
    , CSS.margin "0"
    , CSS.padding (CSS.rem 0.75)
    , "max-width" =: "calc(100% - 1.5rem)"
    , "max-height" =: "calc(100% - 1.5rem)"
    , CSS.overflow "auto"
    , CSS.fontFamily "monospace"
    , CSS.fontSize (CSS.rem 0.8)
    , "white-space" =: "pre"
    , CSS.backgroundColor (CSS.var "surface")
    , CSS.color (CSS.var "text-color")
    , CSS.border "1px solid var(--border)"
    , CSS.borderRadius (CSS.rem 0.25)
    ]
  ]

-----------------------------------------------------------------------------
