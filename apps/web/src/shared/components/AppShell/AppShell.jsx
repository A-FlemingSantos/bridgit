import AppHeader from '../../../shared/components/AppHeader/AppHeader.jsx'
import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import styles from './AppShell.module.css'

export default function AppShell({ children, refreshKey }) {
  return (
    <div className={styles.page}>
      <AppHeader />
      <CustomScrollArea className={styles.scroll} viewportClassName={styles.viewport} refreshKey={refreshKey}>
        {children}
      </CustomScrollArea>
    </div>
  )
}
