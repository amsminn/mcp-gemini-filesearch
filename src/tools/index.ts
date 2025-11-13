/**
 * MCP 도구 인덱스
 *
 * 모든 MCP 도구와 메타데이터를 export합니다.
 */

import { addDocument, addDocumentToolMetadata } from './add-document.js';
import { search, searchToolMetadata } from './search.js';
import { getPassages, getPassagesToolMetadata } from './get-passages.js';
import { listDocuments, listDocumentsToolMetadata } from './list-documents.js';
import { deleteDocument, deleteDocumentToolMetadata } from './delete-document.js';
import { createFileStore, createFileStoreToolMetadata } from './create-file-store.js';

// Re-export all tools
export {
  addDocument,
  addDocumentToolMetadata,
  search,
  searchToolMetadata,
  getPassages,
  getPassagesToolMetadata,
  listDocuments,
  listDocumentsToolMetadata,
  deleteDocument,
  deleteDocumentToolMetadata,
  createFileStore,
  createFileStoreToolMetadata,
};

/**
 * 모든 도구 메타데이터 배열
 */
export const allToolMetadata = [
  createFileStoreToolMetadata,
  addDocumentToolMetadata,
  searchToolMetadata,
  getPassagesToolMetadata,
  listDocumentsToolMetadata,
  deleteDocumentToolMetadata,
];

/**
 * 도구 핸들러 맵 (이름 → 핸들러 함수)
 */
export const toolHandlers = {
  create_file_store: createFileStore,
  add_document: addDocument,
  search: search,
  get_passages: getPassages,
  list_documents: listDocuments,
  delete_document: deleteDocument,
};
