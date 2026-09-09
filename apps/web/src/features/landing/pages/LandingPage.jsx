import Header from '../components/Header/Header.jsx'
import Hero from '../components/Hero/Hero.jsx'
import Footer from '../components/Footer/Footer.jsx'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <Hero />
      </main>
      <Footer />
    </div>
  )
}
