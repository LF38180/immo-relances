// Imports nommés (tree-shaking) : seules les icônes réellement utilisées sont embarquées.
// Si une icône manque, fallback sur Circle (pas de crash).
import {
  ArrowLeft, ArrowRight, Calendar, CalendarCheck, CalendarClock, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, Circle, CircleCheckBig, CircleX, Database, Download, Eye, FileCheck, FileDown,
  FileText, FileUp, History, LayoutDashboard, LogOut, Mail, MapPin, Pencil, Phone, PhoneCall, PhoneOff,
  Pin, Plus, RefreshCw, Search, Settings, Star, Table, Tag, Trash2, TriangleAlert, Trophy,
  Upload, User, Users, Voicemail, X,
} from 'lucide-react'

const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 }

// Dictionnaire nom (kebab du code) -> composant. Couvre tous les usages de l'app.
const MAP = {
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'calendar': Calendar,
  'calendar-check': CalendarCheck, 'calendar-clock': CalendarClock, 'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  'circle': Circle, 'check-circle-2': CircleCheckBig, 'x-circle': CircleX, 'database': Database, 'download': Download,
  'eye': Eye, 'file-check': FileCheck, 'file-down': FileDown, 'file-text': FileText,
  'file-up': FileUp, 'history': History, 'layout-dashboard': LayoutDashboard, 'log-out': LogOut,
  'mail': Mail, 'map-pin': MapPin, 'pencil': Pencil, 'phone': Phone, 'phone-call': PhoneCall, 'phone-off': PhoneOff,
  'pin': Pin, 'plus': Plus, 'refresh-cw': RefreshCw, 'search': Search, 'settings': Settings,
  'star': Star, 'table': Table, 'tag': Tag, 'trash-2': Trash2, 'alert-triangle': TriangleAlert,
  'trophy': Trophy, 'upload': Upload, 'user': User, 'users': Users, 'voicemail': Voicemail, 'x': X,
}

/**
 * Icône SVG unique pour toute l'app (charte : stroke 1.75 cohérent).
 * @param {string} name - nom en kebab-case (ex: "phone-off")
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl' (défaut md)
 * @param {string} label - si fourni, annoncée aux lecteurs d'écran ; sinon aria-hidden
 */
export default function Icon({ name, size = 'md', label, className = '', strokeWidth = 1.75, ...rest }) {
  const LucideIcon = MAP[name] || Circle
  const px = SIZES[size] || size
  return (
    <LucideIcon
      width={px} height={px} strokeWidth={strokeWidth} className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      {...rest}
    />
  )
}
