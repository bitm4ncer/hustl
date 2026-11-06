import { buildServer } from './index'
import { loadConfig } from './config'

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const app = await buildServer(config)
  await app.listen({ port: config.port, host: '0.0.0.0' })
  // eslint-disable-next-line no-console
  console.log(`hustl listening on :${config.port} (data: ${config.dataDir})`)
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
