-----------------------------------------------------------------------------
{-# LANGUAGE LambdaCase        #-}
{-# LANGUAGE OverloadedStrings #-}
-----------------------------------------------------------------------------
module Examples.TextureSettings
  ( component
  , sheet
  ) where
-----------------------------------------------------------------------------
import qualified Interop as I
import           Miso hiding (component)
import qualified Miso as Miso
import qualified Miso.CSS as CSS
import           Miso.CSS (StyleSheet)
import           Miso.Html.Element as H
import           Miso.Html.Property as P
import qualified Miso.Html.Event as HE
-----------------------------------------------------------------------------
data AddressMode
  = ClampToEdge
  | Repeat
  deriving (Eq)

data FilterMode
  = Nearest
  | Linear
  deriving (Eq)

data Model = Model
  { addressModeU :: AddressMode
  , addressModeV :: AddressMode
  , magFilter    :: FilterMode
  , minFilter    :: FilterMode
  , scale        :: Double
  }
  deriving (Eq)

data Action
  = SetAddressModeU AddressMode
  | SetAddressModeV AddressMode
  | SetMagFilter FilterMode
  | SetMinFilter FilterMode
  | SetScale Double
  deriving (Eq)
-----------------------------------------------------------------------------
component :: Component parent () Model Action
component = Miso.component initialModel updateModel viewModel

initialModel :: Model
initialModel = Model
  { addressModeU = ClampToEdge
  , addressModeV = ClampToEdge
  , magFilter = Nearest
  , minFilter = Linear
  , scale = 2.5
  }

updateModel :: Action -> Effect parent () Model Action
updateModel = \case
  SetAddressModeU mode ->
    applyModelChange $ \amodel -> amodel { addressModeU = mode }
  SetAddressModeV mode ->
    applyModelChange $ \amodel -> amodel { addressModeV = mode }
  SetMagFilter mode ->
    applyModelChange $ \amodel -> amodel { magFilter = mode }
  SetMinFilter mode ->
    applyModelChange $ \amodel -> amodel { minFilter = mode }
  SetScale newScale ->
    applyModelChange $ \amodel -> amodel { scale = newScale }

applyModelChange
  :: (Model -> Model)
  -> Effect parent () Model Action
applyModelChange change = do
  amodel <- get
  let updatedModel = change amodel
  put updatedModel
  io_ $ sendSettings updatedModel

sendSettings :: Model -> IO ()
sendSettings amodel = I.changeTextureSettings
  (addressModeValue $ addressModeU amodel)
  (addressModeValue $ addressModeV amodel)
  (filterModeValue $ magFilter amodel)
  (filterModeValue $ minFilter amodel)
  (scale amodel)

viewModel :: () -> Model -> View Model Action
viewModel _ amodel = H.div_
  [ P.class_ "texture-settings"
  ]
  [ H.h2_
    [ P.class_ "texture-settings-title"
    ]
    [ "Texture settings"
    ]
  , addressModeControl "Address mode U" (addressModeU amodel) SetAddressModeU
  , addressModeControl "Address mode V" (addressModeV amodel) SetAddressModeV
  , filterModeControl "Mag filter" (magFilter amodel) SetMagFilter
  , filterModeControl "Min filter" (minFilter amodel) SetMinFilter
  , H.label_
    [ P.class_ "texture-setting"
    ]
    [ H.span_ [] [ "Scale" ]
    , H.output_
      [ P.class_ "texture-setting-value"
      ]
      [ text $ ms $ scale amodel
      ]
    , H.input_
      [ P.class_ "texture-scale-input"
      , P.type_ "range"
      , P.min_ "0.5"
      , P.max_ "6"
      , P.step_ "0.1"
      , P.value_ $ ms $ scale amodel
      , HE.onInput (SetScale . fromMisoString)
      ]
    ]
  ]

addressModeControl
  :: MisoString
  -> AddressMode
  -> (AddressMode -> Action)
  -> View Model Action
addressModeControl label mode toAction = selectControl
  label
  (addressModeValue mode)
  (toAction . addressModeFromValue)
  (addressModeValue <$> [ClampToEdge, Repeat])

filterModeControl
  :: MisoString
  -> FilterMode
  -> (FilterMode -> Action)
  -> View Model Action
filterModeControl label mode toAction = selectControl
  label
  (filterModeValue mode)
  (toAction . filterModeFromValue)
  (filterModeValue <$> [Nearest, Linear])

selectControl
  :: MisoString
  -> MisoString
  -> (MisoString -> Action)
  -> [MisoString]
  -> View Model Action
selectControl label selectedValue onChange options = H.label_
  [ P.class_ "texture-setting"
  ]
  [ H.span_ [] [ text label ]
  , H.select_
    [ P.class_ "texture-setting-select"
    , P.value_ selectedValue
    , HE.onChange onChange
    ]
    [ H.option_
      [ P.value_ value
      ]
      [ text value
      ]
    | value <- options
    ]
  ]

addressModeValue :: AddressMode -> MisoString
addressModeValue = \case
  ClampToEdge -> "clamp-to-edge"
  Repeat -> "repeat"

addressModeFromValue :: MisoString -> AddressMode
addressModeFromValue = \case
  "repeat" -> Repeat
  _ -> ClampToEdge

filterModeValue :: FilterMode -> MisoString
filterModeValue = \case
  Nearest -> "nearest"
  Linear -> "linear"

filterModeFromValue :: MisoString -> FilterMode
filterModeFromValue = \case
  "linear" -> Linear
  _ -> Nearest
-----------------------------------------------------------------------------
sheet :: StyleSheet
sheet =
  CSS.sheet_
  [ CSS.selector_ ".texture-settings"
    [ "position" =: "absolute"
    , "top" =: "0.75rem"
    , "right" =: "0.75rem"
    , "z-index" =: "1"
    , CSS.boxSizing "border-box"
    , CSS.display "flex"
    , CSS.flexDirection "column"
    , CSS.gap (CSS.rem 0.65)
    , CSS.width (CSS.rem 18)
    , CSS.padding (CSS.rem 0.75)
    , CSS.backgroundColor (CSS.var "surface")
    , CSS.border "1px solid var(--border)"
    , CSS.borderRadius (CSS.rem 0.25)
    , "box-shadow" =: "0 0.25rem 0.75rem rgba(0, 0, 0, 0.3)"
    ]
  , CSS.selector_ ".texture-settings-title"
    [ CSS.margin "0"
    , CSS.fontSize (CSS.rem 0.9)
    ]
  , CSS.selector_ ".texture-setting"
    [ CSS.display "grid"
    , "grid-template-columns" =: "1fr 8rem"
    , CSS.alignItems "center"
    , CSS.gap (CSS.rem 0.5)
    , CSS.fontSize (CSS.rem 0.8)
    ]
  , CSS.selector_ ".texture-setting-select"
    [ CSS.width "100%"
    , CSS.padding "0.25rem 0.35rem"
    , CSS.border "1px solid var(--border)"
    , CSS.borderRadius (CSS.rem 0.25)
    , CSS.backgroundColor (CSS.var "surface")
    , CSS.color (CSS.var "text-color")
    ]
  , CSS.selector_ ".texture-setting-value"
    [ "justify-self" =: "end"
    ]
  , CSS.selector_ ".texture-scale-input"
    [ "grid-column" =: "1 / -1"
    , CSS.width "100%"
    , CSS.margin "0"
    ]
  ]
-----------------------------------------------------------------------------
