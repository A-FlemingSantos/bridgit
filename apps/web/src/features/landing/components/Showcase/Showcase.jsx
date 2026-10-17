import { FileText, Folder, Image, Sheet } from 'lucide-react'
import styles from './Showcase.module.css'

const ROWS = [
  { icon: Folder, name: 'Contratos 2026', source: 'OneDrive' },
  { icon: Sheet, name: 'Orçamento Q4.xlsx', source: 'Google Drive' },
  { icon: FileText, name: 'Proposta comercial.pdf', source: 'Dropbox' },
  { icon: Image, name: 'Identidade visual.png', source: 'Google Drive' },
  { icon: FileText, name: 'Ata de reunião.docx', source: 'OneDrive' },
]

function SpacePreview() {
  return (
    <div className={styles.window} aria-hidden="true">
      <div className={styles.chrome}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.pane}>
        <p className={styles.crumb}>Spaces / Cliente Aurora</p>
        <ul className={styles.rows}>
          {ROWS.map(({ icon: Icon, name, source }) => (
            <li key={name} className={styles.row}>
              <Icon size={14} strokeWidth={1.6} />
              <span className={styles.name}>{name}</span>
              <span className={styles.source}>{source}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function Showcase() {
  return (
    <section className={styles.section} aria-labelledby="landing-showcase">
      <h2 id="landing-showcase" className={styles.heading}>
        Em destaque
      </h2>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h3 className={styles.title}>Spaces</h3>
          <p className={styles.lede}>
            Um espaço por projeto, com arquivos de qualquer nuvem lado a lado.
          </p>
          <p className={styles.body}>
            Equipes raramente guardam tudo no mesmo lugar. O contrato está no OneDrive do jurídico,
            a planilha no Drive do financeiro e a apresentação no Dropbox da agência. Com Spaces,
            tudo isso aparece junto, sem mover nem duplicar nada.
          </p>
          <p className={styles.body}>
            Cada item continua ligado à origem: abra, pré-visualize ou compartilhe por link público
            direto do Bridgit, sem alternar entre abas.
          </p>
        </div>
        <SpacePreview />
      </div>
    </section>
  )
}
