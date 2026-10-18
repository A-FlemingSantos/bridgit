import CustomScrollArea from '../../../shared/components/CustomScrollArea/CustomScrollArea.jsx'
import Header from '../components/Header/Header.jsx'
import Hero from '../components/Hero/Hero.jsx'
import Services from '../components/Services/Services.jsx'
import Showcase from '../components/Showcase/Showcase.jsx'
import AppDownload from '../components/AppDownload/AppDownload.jsx'
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
        <div className={styles.shell}>
          <Header />
          <main>
            <Hero />
            <Services />
            <Showcase />
            <AppDownload />
          </main>
          <Footer />
        </div>
      </CustomScrollArea>
    </div>
  )
}
