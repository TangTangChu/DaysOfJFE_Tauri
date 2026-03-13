import { GalgameFacadeImpl } from './facade/galgameFacade'
import { TauriPersistenceApi } from '../infrastructure/tauri/persistenceApi'

const persistenceApi = new TauriPersistenceApi()
const facade = new GalgameFacadeImpl(persistenceApi)

export function useGalgameFacade() {
  return facade
}
