import { useState } from 'react'
import Store from 'electron-store'
import { getCurrentWindow } from '@electron/remote'

import { install } from './install'
import OllamaIcon from './ollama.svg'
import DownloadModels from './DownloadModels'

const store = new Store()

enum Step {
  WELCOME = 0,
  CLI,
  DOWNLOAD_MODELS,
}

export default function App() {
  const [step, setStep] = useState<Step>(store.get('first-time-run', true) ? Step.WELCOME : Step.DOWNLOAD_MODELS)

  return (
    <div className='drag'>
      <div className='mx-auto flex min-h-screen w-full flex-col justify-between bg-white px-4 pt-16'>
        {step === Step.WELCOME && (
          <>
            <div className='mx-auto text-center'>
              <h1 className='mb-6 mt-4 text-2xl tracking-tight text-gray-900'>Welcome to Ollama</h1>
              <p className='mx-auto w-[65%] text-sm text-gray-400'>
                Let's get you up and running with your own large language models.
              </p>
              <button
                onClick={() => setStep(Step.CLI)}
                className='no-drag rounded-dm mx-auto my-8 w-[40%] rounded-md bg-black px-4 py-2 text-sm text-white hover:brightness-110'
              >
                Next
              </button>
            </div>
            <div className='mx-auto'>
              <OllamaIcon />
            </div>
          </>
        )}
        {step === Step.CLI && (
          <>
            <div className='mx-auto flex flex-col space-y-28 text-center'>
              <h1 className='mt-4 text-2xl tracking-tight text-gray-900'>Install the command line</h1>
              <pre className='mx-auto text-4xl text-gray-400'>&gt; ollama</pre>
              <div className='mx-auto'>
                <button
                  onClick={async () => {
                    try {
                      await install()
                      store.set('first-time-run', false)
                      setStep(Step.DOWNLOAD_MODELS)
                    } catch (e) {
                      console.error('could not install: ', e)
                    } finally {
                      getCurrentWindow().show()
                      getCurrentWindow().focus()
                    }
                  }}
                  className='no-drag rounded-dm mx-auto w-[60%] rounded-md bg-black px-4 py-2 text-sm text-white hover:brightness-110'
                >
                  Install
                </button>
                <p className='mx-auto my-4 w-[70%] text-xs text-gray-400'>
                  You will be prompted for administrator access
                </p>
              </div>
            </div>
          </>
        )}
        {step === Step.DOWNLOAD_MODELS && <DownloadModels />}
      </div>
    </div>
  )
}
