import styles from './Showcase.module.css'

export default function Showcase() {
  return (
    <section className={styles.section} aria-labelledby="landing-showcase">
      <h2 id="landing-showcase" className={styles.heading}>
        Em destaque
      </h2>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h3 className={styles.title}>Privacidade em ambientes corporativos</h3>
          <p className={styles.lede}>
            Três nuvens atrás de um único usuário e senha.
          </p>
          <p className={styles.body}>
            Em um computador compartilhado ou de trabalho, entrar na conta Google ou Microsoft só para
            pegar um arquivo abre muito mais do que o necessário: e-mail, agenda, contatos e toda a
            suíte de aplicativos daquele ecossistema ficam a um clique de distância.
          </p>
          <p className={styles.body}>
            Com o Bridgit, você acessa OneDrive, Google Drive e Dropbox pela sua conta Bridgit. Os
            arquivos aparecem; o resto da sua vida digital fica de fora. Ao terminar, encerre a
            sessão ou revogue o dispositivo em Segurança.
          </p>
        </div>
        <svg
          className={styles.art}
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 2h14v2H5zm0 18h14v2H5zM3 4h2v16H3zm16 0h2v16h-2zM7 6h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm-1 4h4v2h-4zm5-4h2v2h-2z" />
        </svg>
      </div>
    </section>
  )
}
