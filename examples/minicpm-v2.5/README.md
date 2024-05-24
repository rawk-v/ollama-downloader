## MiniCPM-Llama3-V 2.5

### Usage

Currently, minicpmv2.5 has not been merged into the official branch, so it needs to be used in the following ways. Let's take mac as an example. 

If you have any questions, please feel free to mention issue, and we will reply as soon as possible.

### clone code

Clone ollama and checkout to branch `minicpm-v2.5`;

Clone llama.cpp and checkout to branch `minicpm-v2.5_for_ollama`:

```bash
git clone -b minicpm-v2.5 https://github.com/OpenBMB/ollama.git
cd ollama/llm
git clone -b minicpm-v2.5_for_ollama https://github.com/OpenBMB/llama.cpp.git
cd ../
```

### Building

Install required tools:

- cmake version 3.24 or higher
- go version 1.22 or higher
- gcc version 11.4.0 or higher

### MacOS

```bash
brew install go cmake gcc
```

Optionally enable debugging and more verbose logging:

```bash
# At build time
export CGO_CFLAGS="-g"

# At runtime
export OLLAMA_DEBUG=1
```

Get the required libraries and build the native LLM code:

```bash
go generate ./...
```

Then build ollama:

```bash
go build .
```

See the [developer guide](https://github.com/ollama/ollama/blob/main/docs/development.md) for more drives


Next, start the server:

```
./ollama serve
```

### Running 

1. Create a file named `Modelfile`, with a `FROM` instruction with the local filepath to the model you want to import.

```
FROM ./MiniCPM-V-2_5/mmproj-model-f16.gguf
FROM ./MiniCPM-V-2_5/model/ggml-model-Q4_K_M.gguf
```

2. Create the model in Ollama

```
ollama create test -f examples/minicpm-v2.5/Modelfile
```

3. Run the model

```
ollama run test
```