import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import Header from '../components/Header/Header.jsx'
import Hero from '../components/Hero/Hero.jsx'
import Footer from '../components/Footer/Footer.jsx'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <CustomScrollArea
        className={styles.scroll}
        viewportClassName={styles.viewport}
        refreshKey="landing"
      >
        <div className={styles.heroBlock}>
          <Header />
          <main>
            <Hero />
          </main>
        </div>
        <Footer />
      </CustomScrollArea>
    </div>
  )
}
