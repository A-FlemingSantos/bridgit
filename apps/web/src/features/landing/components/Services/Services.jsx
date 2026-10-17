import { Cloud, FolderKanban, Link2, Search, ShieldCheck, Smartphone } from 'lucide-react'
import styles from './Services.module.css'

const SERVICES = [
  {
    icon: Cloud,
    title: 'Três nuvens, uma conta',
    body: 'Conecte OneDrive, Google Drive e Dropbox uma única vez. Seus arquivos continuam onde estão; o Bridgit só tira as paredes entre eles.',
  },
  {
    icon: FolderKanban,
    title: 'Spaces',
    body: 'Agrupe pastas e arquivos de provedores diferentes em espaços por projeto, cliente ou equipe. Organização que não depende de onde o arquivo mora.',
  },
  {
    icon: Search,
    title: 'Busca unificada',
    body: 'Uma barra, todos os provedores. Encontre o contrato, a planilha ou a foto sem lembrar em qual nuvem ela foi parar.',
  },
  {
    icon: Link2,
    title: 'Links públicos',
    body: 'Compartilhe um arquivo com quem não tem conta, por um link limpo e revogável a qualquer momento.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacidade e segurança',
    body: 'Sessões por dispositivo, acesso revogável e nenhum arquivo copiado sem necessidade. Feito para ambientes empresariais.',
  },
  {
    icon: Smartphone,
    title: 'Web e Android',
    body: 'A mesma experiência no navegador e no celular, sincronizada. Comece no computador, termine no caminho.',
  },
]

export default function Services() {
  return (
    <section className={styles.section} aria-labelledby="landing-services">
      <h2 id="landing-services" className={styles.heading}>
        Como o Bridgit ajuda você
      </h2>
      <ul className={styles.grid}>
        {SERVICES.map(({ icon: Icon, title, body }) => (
          <li key={title} className={styles.item}>
            <Icon className={styles.icon} size={18} strokeWidth={1.6} aria-hidden="true" />
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.body}>{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
