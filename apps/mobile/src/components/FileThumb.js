import { useEffect, useRef, useState } from 'react'
import { Animated, Image, StyleSheet, View } from 'react-native'
import { officeBadge } from '../hub/thumbnails'
import FileSheet from './FileSheet'
import FileTypeIcon from './FileTypeIcon'
import { useFileThumbnail } from './useFileThumbnail'

// Width / height of each preview already shown, so a remounted tile lays it out without waiting.
const aspects = new Map()

// The widest and tallest shapes a kept-shape preview may take (width / height).
const MAX_ASPECT = 1.5
const MIN_ASPECT = 0.6

// A file's face, as on the web: the cloud's own preview when it has one, else the Word, Excel,
// PowerPoint or Google logo, else the pixel sheet. It fills the box the caller gives it (`style`, a
// `size` square by default), placed by that style's justifyContent. `fit` 'cover' fills the box and
// crops; 'contain' keeps the file's shape. `size` is the side of the logo or sheet; `badge` puts the
// logo on the preview's corner, so a document stays recognizable by its type; `dimmed` is the pressed look.
export default function FileThumb({ file, size = 48, fit = 'contain', badge = false, dimmed = false, style = null }) {
  const uri = useFileThumbnail(file)
  const kind = officeBadge(file)
  const [box, setBox] = useState(null)
  const [aspect, setAspect] = useState(() => (uri ? aspects.get(uri) ?? null : null))
  const [failed, setFailed] = useState(null)
  const fade = useRef(new Animated.Value(uri ? 1 : 0)).current

  useEffect(() => {
    if (!uri || fit !== 'contain') return undefined
    if (aspects.has(uri)) {
      setAspect(aspects.get(uri))
      return undefined
    }
    let active = true
    setAspect(null)
    Image.getSize(
      uri,
      (width, height) => {
        if (!width || !height) return
        aspects.set(uri, width / height)
        if (active) setAspect(width / height)
      },
      () => {
        if (active) setFailed(uri)
      },
    )
    return () => {
      active = false
    }
  }, [uri, fit])

  const shown = Boolean(uri) && failed !== uri && (fit === 'cover' || (aspect && box))

  useEffect(() => {
    if (!shown) return
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }, [shown, fade])

  let preview = null
  if (shown) {
    let frame = StyleSheet.absoluteFill
    let image = StyleSheet.absoluteFill
    if (fit === 'contain') {
      // A preview much wider or taller than a page keeps a page's shape instead, the preview across its
      // top: a one-line note (a thin strip) reads as a short page, a long one is cut at the bottom.
      const shape = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))
      const width = Math.min(box.width, box.height * shape)
      frame = [styles.page, aspect > shape ? styles.paper : null, { width, height: width / shape }]
      image = { position: 'absolute', left: 0, top: 0, width, height: width / aspect }
    }
    preview = (
      <Animated.View style={[frame, { opacity: dimmed ? Animated.multiply(fade, 0.8) : fade }]}>
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri }}
          resizeMode="cover"
          onError={() => setFailed(uri)}
          style={image}
        />
        {badge && kind ? (
          <View style={styles.badge}>
            <FileTypeIcon kind={kind} size={18} />
          </View>
        ) : null}
      </Animated.View>
    )
  }

  return (
    <View
      onLayout={fit === 'contain' ? (event) => {
        const { width, height } = event.nativeEvent.layout
        setBox((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }))
      } : undefined}
      style={[styles.root, style ?? { width: size, height: size }]}
    >
      {preview ?? (kind ? <FileTypeIcon kind={kind} size={size} /> : <FileSheet file={file} size={size} />)}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  page: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  // The page under a short preview: the clouds draw text files on white.
  paper: {
    backgroundColor: '#ffffff',
  },
  badge: {
    position: 'absolute',
    left: 3,
    bottom: 3,
  },
})
