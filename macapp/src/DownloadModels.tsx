import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = 'http://localhost:11434'

type Progress = { [digest: string]: { total: number; completed: number } }

export default function DownloadModels() {
    const [models, setModels] = useState([])
    const [modelName, setModelName] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [progress, setProgress] = useState<Progress>({})
    const [downloadCompleted, setDownloadCompleted] = useState(false)

    useEffect(() => {
        fetchLocalModels()
    }, [])

    const fetchLocalModels = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/tags`)
            setModels(response.data.models)
        } catch (error) {
            console.error('Error fetching local models:', error)
        }
    }

    useEffect(() => {
        if (downloadCompleted) {
            fetchLocalModels()
            setDownloadCompleted(false)
        }
    }, [downloadCompleted])

    const handleDownload = async () => {
        try {
            setIsDownloading(true)
            setProgress({})
            const response = await fetch(`${API_URL}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName, stream: true }),
            })

            if (!response.body) {
                throw new Error('ReadableStream not supported!')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder('utf-8')
            const bars: Progress = {}

            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const text = decoder.decode(value)
                buffer += text

                let boundary = buffer.indexOf('\n')
                while (boundary !== -1) {
                    const jsonString = buffer.slice(0, boundary).trim()
                    buffer = buffer.slice(boundary + 1)
                    boundary = buffer.indexOf('\n')

                    if (jsonString) {
                        try {
                            const json = JSON.parse(jsonString)

                            if (json.digest) {
                                if (!bars[json.digest]) {
                                    bars[json.digest] = { total: json.total, completed: json.completed || 0 }
                                } else {
                                    bars[json.digest].completed = json.completed || 0
                                }
                                setProgress({ ...bars })
                            }

                            if (json.status === 'success') {
                                setDownloadCompleted(true)
                            }
                        } catch (err) {
                            console.error('Error parsing JSON:', err, 'Original text:', jsonString)
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error downloading model:', error)
        } finally {
            setIsDownloading(false)
        }
    }

    const handleDelete = async (name: string) => {
        try {
            await axios.delete(`${API_URL}/api/delete`, { data: { name } })
            await fetchLocalModels()
        } catch (error) {
            console.error('Error deleting model:', error)
        }
    }

    const isModelLocal = models.some(model => model.name === modelName)

    return (
        <div className='max-w-xl flex flex-col h-full'>
            <h1 className='text-2xl mb-4 text-center'>Download models</h1>
            <div className='flex flex-col no-drag'>
                <div className='mb-4'>
                    <input
                        type='text'
                        placeholder='Enter model name, e.g. llama3:13b'
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        className='border p-2 rounded w-full'
                    />
                </div>
                <div className='text-center'>
                    <button
                        onClick={handleDownload}
                        disabled={!modelName || isModelLocal || isDownloading}
                        className={`p-2 rounded-md ${isModelLocal || !modelName || isDownloading ? 'bg-gray-300 text-gray-400' : 'bg-black text-white hover:bg-gray-900'}`}
                    >
                        Download
                    </button>
                </div>
                {isDownloading && (
                    <div className='mt-4'>
                        {Object.keys(progress).map(digest => (
                            <div key={digest} className='mb-2'>
                                <div className='text-xs mb-1'>{`Downloading ${digest.slice(0, 24)}...`}</div>
                                <div className='w-full bg-gray-200 rounded'>
                                    <div className='bg-blue-500 text-xs font-medium text-blue-100 text-center p-0.5 leading-none rounded' style={{ width: `${(progress[digest].completed / progress[digest].total) * 100}%` }}>
                                        {Math.round((progress[digest].completed / progress[digest].total) * 100)}%
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <h3 className='text-xl mt-2 mb-2'>Local models</h3>
                <ul className='mx-auto mb-4'>
                    {models.map((model) => (
                        <li key={model.name} className='mb-2 flex flex-row justify-between items-center group'>
                            <div className='flex items-center justify-start'>
                            <span className="flex">{model.name.split(':')[0]}</span>
                            <span className='bg-auto flex-none text-xs rounded-md items-end mx-1 bg-gray-200 p-1'>{model.name.split(':')[1]}</span>
                            <span className="bg-auto flex-none text-xs rounded-md items-end mx-1 bg-gray-200 p-1">{Math.round(model.size/1014/1024)}MB</span>
                            </div>
                            <button onClick={() => handleDelete(model.name)}
                                    className='bg-red-500 flex-none text-sm text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity'>
                                Delete
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
