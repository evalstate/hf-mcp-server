interface DocMapping {
  repo_id: string;
  doc_folder: string;
}

export const DOC_MAPPINGS: Record<string, DocMapping> = {
  'tokenizers': {
    repo_id: 'huggingface/tokenizers',
    doc_folder: 'docs/source-doc-builder'
  },
  'diffusers': {
    repo_id: 'huggingface/diffusers',
    doc_folder: 'docs/source/en'
  },
  'accelerate': {
    repo_id: 'huggingface/accelerate',
    doc_folder: 'docs/source'
  },
  'huggingface_hub': {
    repo_id: 'huggingface/huggingface_hub',
    doc_folder: 'docs/source/en'
  },
  'transformers': {
    repo_id: 'huggingface/transformers',
    doc_folder: 'docs/source/en'
  },
  'hub': {
    repo_id: 'huggingface/hub-docs',
    doc_folder: 'docs/hub'
  },
  'huggingface.js': {
    repo_id: 'huggingface/huggingface.js',
    doc_folder: 'docs'
  },
  'transformers.js': {
    repo_id: 'huggingface/transformers.js',
    doc_folder: 'docs/source'
  },
  'smolagents': {
    repo_id: 'huggingface/smolagents',
    doc_folder: 'docs/source/en'
  },
  'peft': {
    repo_id: 'huggingface/peft',
    doc_folder: 'docs/source'
  },
  'trl': {
    repo_id: 'huggingface/trl',
    doc_folder: 'docs/source'
  },
  'bitsandbytes': {
    repo_id: 'bitsandbytes-foundation/bitsandbytes',
    doc_folder: 'docs/source'
  },
  'lerobot': {
    repo_id: 'huggingface/lerobot',
    doc_folder: 'docs/source'
  },
  'timm': {
    repo_id: 'huggingface/pytorch-image-models',
    doc_folder: 'hfdocs/source'
  },
  'inference-providers': {
    repo_id: 'huggingface/hub-docs',
    doc_folder: 'docs/inference-providers'
  },
  'safetensors': {
    repo_id: 'huggingface/safetensors',
    doc_folder: 'docs/source'
  },
  'inference-endpoints': {
    repo_id: 'huggingface/hf-endpoints-documentation',
    doc_folder: 'docs/source'
  },
  'dataset-viewer': {
    repo_id: 'huggingface/dataset-viewer',
    doc_folder: 'docs/source'
  }
};