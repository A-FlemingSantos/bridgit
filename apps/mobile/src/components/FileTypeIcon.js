import {
  EXCEL_MARK,
  GOOGLE_DOCS_MARK,
  GOOGLE_SHEETS_MARK,
  GOOGLE_SLIDES_MARK,
  POWERPOINT_MARK,
  WORD_MARK,
} from '../assets/fileTypeMarks'
import SvgMark from './SvgMark'

const MARKS = {
  word: WORD_MARK,
  excel: EXCEL_MARK,
  powerpoint: POWERPOINT_MARK,
  'google-docs': GOOGLE_DOCS_MARK,
  'google-sheets': GOOGLE_SHEETS_MARK,
  'google-slides': GOOGLE_SLIDES_MARK,
}

// The Word, Excel, PowerPoint or Google logo for a file kind (see officeBadge), square at `size`.
export default function FileTypeIcon({ kind, size = 22 }) {
  return MARKS[kind] ? <SvgMark source={MARKS[kind]} size={size} /> : null
}
