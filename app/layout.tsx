import './globals.css'
export const metadata = { title: 'Clairvoyant AI', description: 'Multimodal Vision Agent' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>)
}
