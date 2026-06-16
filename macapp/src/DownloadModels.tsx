import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { ipcRenderer } from 'electron'
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    MagnifyingGlassIcon,
    TrashIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline'

function apiURL() {
    const host = process.env.OLLAMA_HOST || 'localhost:11434'
    return /^https?:\/\//.test(host) ? host : `http://${host}`
}

const API_URL = apiURL()

type LocalModel = {
    name: string
    model?: string
    size?: number
    modified_at?: string
    details?: {
        family?: string
        parameter_size?: string
        quantization_level?: string
    }
}

type LibraryModel = {
    name: string
    path: string
    description: string
    capabilities: string[]
    sizes: string[]
    pulls: string
    tags: string
    updated: string
}

type LibrarySearchResponse = {
    models: LibraryModel[]
    nextPage: number | null
}

type RuntimeInfo = {
    host: string
    modelsPath: string
    displayModelsPath: string
}

type Progress = { [digest: string]: { total: number; completed: number } }

type DownloadState = {
    active: boolean
    target: string
    progress: Progress
    status: string
    error: string
}

function formatBytes(bytes?: number) {
    if (!bytes) {
        return ''
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }

    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`
}

function messageFromError(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function variantOptions(model: LibraryModel) {
    const sizes = model.sizes
        .filter(size => size && !size.includes(' '))
        .map(size => ({ label: size, value: `${model.name}:${size}` }))

    return [{ label: 'latest', value: model.name }, ...sizes]
}

function isLocalModel(models: LocalModel[], name: string) {
    return models.some(model => model.name === name || model.model === name || model.name === `${name}:latest`)
}

function mergeModels(current: LibraryModel[], incoming: LibraryModel[]) {
    const seen = new Set(current.map(model => model.path || model.name))
    const next = [...current]

    for (const model of incoming) {
        const key = model.path || model.name
        if (!seen.has(key)) {
            seen.add(key)
            next.push(model)
        }
    }

    return next
}

function progressPercent(progress: Progress) {
    const entries = Object.values(progress).filter(entry => entry.total > 0)
    if (!entries.length) {
        return 0
    }

    const completed = entries.reduce((sum, entry) => sum + (entry.completed || 0), 0)
    const total = entries.reduce((sum, entry) => sum + entry.total, 0)
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
}

async function searchLibrary(query: string, page: number) {
    return ipcRenderer.invoke('ollama-library:search', query, page) as Promise<LibrarySearchResponse>
}

async function runtimeInfo() {
    return ipcRenderer.invoke('ollama-runtime:info') as Promise<RuntimeInfo>
}

export default function DownloadModels() {
    const [localModels, setLocalModels] = useState<LocalModel[]>([])
    const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
    const [query, setQuery] = useState('')
    const [libraryModels, setLibraryModels] = useState<LibraryModel[]>([])
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
    const [nextPage, setNextPage] = useState<number | null>(null)
    const [isLoadingLocal, setIsLoadingLocal] = useState(false)
    const [localError, setLocalError] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState('')
    const [downloadState, setDownloadState] = useState<DownloadState | null>(null)

    const fetchLocalModels = useCallback(async ({ quiet = false } = {}) => {
        setIsLoadingLocal(true)
        if (!quiet) {
            setLocalError('')
        }

        try {
            const response = await axios.get(`${API_URL}/api/tags`)
            setLocalModels(response.data.models || [])
            setLocalError('')
            return true
        } catch (error) {
            console.error('Error fetching local models:', error)
            if (!quiet) {
                setLocalError(messageFromError(error))
            }
            return false
        } finally {
            setIsLoadingLocal(false)
        }
    }, [])

    const runSearch = useCallback(async (searchQuery: string, page = 1) => {
        setIsSearching(true)
        setSearchError('')

        try {
            const response = await searchLibrary(searchQuery, page)
            setLibraryModels(current => (page === 1 ? response.models : mergeModels(current, response.models)))
            setNextPage(response.nextPage)
        } catch (error) {
            setSearchError(messageFromError(error))
        } finally {
            setIsSearching(false)
        }
    }, [])

    useEffect(() => {
        runtimeInfo()
            .then(setRuntime)
            .catch(error => console.error('Error loading runtime info:', error))
    }, [])

    useEffect(() => {
        let cancelled = false
        let retryTimer: ReturnType<typeof setTimeout> | null = null
        let attempts = 0

        const refresh = async () => {
            const ok = await fetchLocalModels({ quiet: attempts < 10 })
            if (!cancelled && !ok && attempts < 10) {
                attempts += 1
                retryTimer = setTimeout(refresh, 750)
            }
        }

        refresh()

        return () => {
            cancelled = true
            if (retryTimer) {
                clearTimeout(retryTimer)
            }
        }
    }, [fetchLocalModels])

    useEffect(() => {
        const timeout = setTimeout(() => {
            runSearch(query, 1)
        }, query.trim() ? 250 : 0)

        return () => clearTimeout(timeout)
    }, [query, runSearch])

    const sortedLocalModels = useMemo(() => {
        return [...localModels].sort((a, b) => a.name.localeCompare(b.name))
    }, [localModels])

    const handleDownload = async (name: string) => {
        const bars: Progress = {}
        setDownloadState({ active: true, target: name, progress: {}, status: 'Starting', error: '' })

        try {
            const response = await fetch(`${API_URL}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, stream: true }),
            })

            if (!response.body) {
                throw new Error('ReadableStream not supported')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder('utf-8')
            let buffer = ''

            for (;;) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                let boundary = buffer.indexOf('\n')

                while (boundary !== -1) {
                    const jsonString = buffer.slice(0, boundary).trim()
                    buffer = buffer.slice(boundary + 1)
                    boundary = buffer.indexOf('\n')

                    if (!jsonString) {
                        continue
                    }

                    const json = JSON.parse(jsonString)
                    if (json.error) {
                        throw new Error(json.error)
                    }

                    if (json.digest) {
                        bars[json.digest] = {
                            total: json.total || bars[json.digest]?.total || 0,
                            completed: json.completed || 0,
                        }
                    }

                    setDownloadState({
                        active: json.status !== 'success',
                        target: name,
                        progress: { ...bars },
                        status: json.status || 'Pulling',
                        error: '',
                    })

                    if (json.status === 'success') {
                        await fetchLocalModels()
                    }
                }
            }
        } catch (error) {
            setDownloadState({
                active: false,
                target: name,
                progress: { ...bars },
                status: 'Failed',
                error: messageFromError(error),
            })
        }
    }

    const handleDelete = async (name: string) => {
        try {
            await axios.delete(`${API_URL}/api/delete`, { data: { name } })
            await fetchLocalModels()
            setDownloadState(current => (current?.target === name ? null : current))
        } catch (error) {
            console.error('Error deleting model:', error)
        }
    }

    return (
        <main className='model-manager drag'>
            <div className='model-toolbar drag'>
                <div className='search-control no-drag'>
                    <MagnifyingGlassIcon className='control-icon' />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onInput={event => setQuery(event.currentTarget.value)}
                        placeholder='Search Ollama models'
                        spellCheck={false}
                        autoFocus
                    />
                    {query && (
                        <button className='icon-button' onClick={() => setQuery('')} title='Clear search' aria-label='Clear search'>
                            <XMarkIcon className='button-icon' />
                        </button>
                    )}
                </div>
                <button className='icon-button no-drag' onClick={() => fetchLocalModels()} title='Refresh local models' aria-label='Refresh local models'>
                    <ArrowPathIcon className='button-icon' />
                </button>
            </div>

            <div className='model-content'>
                <section className='library-pane'>
                    <div className='section-header'>
                        <span>Ollama Library</span>
                        <span>{isSearching ? 'Searching' : `${libraryModels.length} results`}</span>
                    </div>

                    {searchError && <div className='inline-error'>{searchError}</div>}

                    <div className='model-list'>
                        {!libraryModels.length && !isSearching && (
                            <div className='empty-state'>No models found</div>
                        )}

                        {libraryModels.map(model => {
                            const options = variantOptions(model)
                            const selectedName = selectedVariants[model.name] || options[0].value
                            const local = isLocalModel(localModels, selectedName)
                            const active = downloadState?.active && downloadState.target === selectedName
                            const percent = active ? progressPercent(downloadState.progress) : 0

                            return (
                                <div className='model-row' key={model.path}>
                                    <div className='model-row-body'>
                                        <div className='model-row-title'>
                                            <span>{model.name}</span>
                                            {model.pulls && <span>{model.pulls} pulls</span>}
                                        </div>
                                        {model.description && <p>{model.description}</p>}
                                        <div className='chip-row'>
                                            {model.capabilities.map(capability => (
                                                <span className='chip accent' key={`${model.name}-${capability}`}>{capability}</span>
                                            ))}
                                            {model.sizes.map(size => (
                                                <span className='chip' key={`${model.name}-${size}`}>{size}</span>
                                            ))}
                                            {model.tags && <span className='chip quiet'>{model.tags} tags</span>}
                                            {model.updated && <span className='chip quiet'>{model.updated}</span>}
                                        </div>
                                    </div>
                                    <div className='model-row-actions'>
                                        {options.length > 1 && (
                                            <select
                                                value={selectedName}
                                                onChange={event => setSelectedVariants(current => ({ ...current, [model.name]: event.target.value }))}
                                                aria-label={`${model.name} variant`}
                                            >
                                                {options.map(option => (
                                                    <option value={option.value} key={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        )}
                                        <button
                                            className='primary-button'
                                            disabled={local || Boolean(downloadState?.active)}
                                            onClick={() => handleDownload(selectedName)}
                                        >
                                            {local ? <CheckCircleIcon className='button-icon' /> : <ArrowDownTrayIcon className='button-icon' />}
                                            <span>{local ? 'Installed' : active ? `${percent}%` : 'Get'}</span>
                                        </button>
                                    </div>
                                </div>
                            )
                        })}

                        {nextPage && (
                            <button className='load-more-button' disabled={isSearching} onClick={() => runSearch(query, nextPage)}>
                                {isSearching ? 'Loading' : 'Load more'}
                            </button>
                        )}
                    </div>
                </section>

                <section className='local-pane'>
                    <div className='section-header'>
                        <span>Installed</span>
                        <span>{isLoadingLocal ? 'Loading' : sortedLocalModels.length}</span>
                    </div>

                    {runtime && (
                        <div className='runtime-source' title={runtime.modelsPath}>
                            <span>{runtime.displayModelsPath}</span>
                            <span>{runtime.host}</span>
                        </div>
                    )}

                    {localError && <div className='inline-error compact'>{localError}</div>}

                    <div className='local-list'>
                        {!sortedLocalModels.length && !isLoadingLocal && <div className='empty-state'>No local models</div>}
                        {sortedLocalModels.map(model => {
                            const [base, tag = 'latest'] = model.name.split(':')
                            const details = [model.details?.parameter_size, model.details?.quantization_level].filter(Boolean)

                            return (
                                <div className='local-row' key={model.name}>
                                    <div className='local-row-body'>
                                        <div className='local-name' title={model.name}>{base}</div>
                                        <div className='chip-row'>
                                            <span className='chip'>{tag}</span>
                                            {model.size && <span className='chip quiet'>{formatBytes(model.size)}</span>}
                                            {details.map(detail => <span className='chip quiet' key={detail}>{detail}</span>)}
                                        </div>
                                    </div>
                                    <button className='icon-button danger' onClick={() => handleDelete(model.name)} title={`Delete ${model.name}`} aria-label={`Delete ${model.name}`}>
                                        <TrashIcon className='button-icon' />
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {downloadState && (
                        <div className={`download-status ${downloadState.error ? 'failed' : ''}`}>
                            <div className='download-status-line'>
                                <span>{downloadState.target}</span>
                                <span>{downloadState.error || downloadState.status}</span>
                            </div>
                            {!downloadState.error && (
                                <div className='progress-track'>
                                    <div style={{ width: `${progressPercent(downloadState.progress)}%` }} />
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </main>
    )
}
