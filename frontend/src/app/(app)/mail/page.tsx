'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Mail, MoreHorizontal, Paperclip, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { AddAccountDialog } from './AddAccountDialog';
import { EditAccountDialog } from './EditAccountDialog';
import {
  getMessage,
  listAccounts,
  listFolders,
  listMessages,
  setFlags,
  type EmailAccountDto,
  type FolderDto,
  type MessageAddressDto,
  type MessageListItemDto,
} from '@/lib/api/mail';

const PAGE_SIZE = 50;
const SEEN_FLAG = '\\Seen';

function formatRelativeDate(input: string | null): string {
  if (!input) return 'Sin fecha';

  const date = new Date(input);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');

  return formatter.format(Math.round(diffMonths / 12), 'year');
}

function formatDateTime(input: string | null): string {
  if (!input) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(input));
}

function formatAddressList(addresses: MessageAddressDto[]): string {
  if (addresses.length === 0) return '—';

  return addresses
    .map((address) => {
      if (address.name && address.address) return `${address.name} <${address.address}>`;
      return address.name ?? address.address ?? 'Sin direccion';
    })
    .join(', ');
}

function formatPrimaryAddress(addresses: MessageAddressDto[]): string {
  const primary = addresses[0];
  if (!primary) return 'Sin remitente';
  return primary.name ?? primary.address ?? 'Sin remitente';
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isUnread(message: MessageListItemDto): boolean {
  return !message.flags.includes(SEEN_FLAG);
}

function sanitizeHtml(input: string): string {
  if (typeof window === 'undefined') return input;

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  doc.querySelectorAll('script, iframe, object, embed, form, meta, base').forEach((element) => {
    element.remove();
  });

  doc.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return doc.documentElement.outerHTML;
}

function MessageRowSkeleton(): JSX.Element {
  return (
    <div className="border-border border-b px-4 py-3 last:border-b-0">
      <div className="space-y-2">
        <div className="bg-surface-muted h-4 w-2/3 animate-pulse rounded-md" />
        <div className="bg-surface-muted h-3 w-1/2 animate-pulse rounded-md" />
        <div className="bg-surface-muted h-3 w-full animate-pulse rounded-md" />
      </div>
    </div>
  );
}

function FolderList({
  accountId,
  selectedAccount,
  selectedFolder,
  onSelect,
}: {
  accountId: string;
  selectedAccount: string | null;
  selectedFolder: string;
  onSelect: (accountId: string, folder: string) => void;
}): JSX.Element {
  const foldersQuery = useQuery({
    queryKey: ['mail', 'folders', accountId],
    queryFn: () => listFolders(accountId),
  });

  const folders = foldersQuery.data ?? [];
  const hasInbox = folders.some((folder) => folder.path === 'INBOX');
  const allFolders: FolderDto[] = hasInbox
    ? folders
    : [{ path: 'INBOX', name: 'INBOX', delimiter: '/', flags: [] }, ...folders];

  if (foldersQuery.isLoading) {
    return (
      <div className="space-y-1 px-2 pb-2 pl-10">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="bg-surface-muted h-8 animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  if (foldersQuery.isError) {
    return (
      <p className="text-danger px-4 pb-2 pl-10 text-xs">No se pudieron cargar las carpetas.</p>
    );
  }

  return (
    <div className="space-y-1 px-2 pb-2 pl-6">
      {allFolders.map((folder) => {
        const active = selectedAccount === accountId && selectedFolder === folder.path;
        return (
          <button
            key={folder.path}
            type="button"
            onClick={() => onSelect(accountId, folder.path)}
            className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
              active
                ? 'bg-accent-soft text-text font-medium'
                : 'text-text-muted hover:bg-surface-muted hover:text-text'
            }`}
          >
            <Mail className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function AccountSection({
  account,
  expanded,
  selectedAccount,
  selectedFolder,
  onToggle,
  onSelectFolder,
  onEdit,
}: {
  account: EmailAccountDto;
  expanded: boolean;
  selectedAccount: string | null;
  selectedFolder: string;
  onToggle: (accountId: string) => void;
  onSelectFolder: (accountId: string, folder: string) => void;
  onEdit: (account: EmailAccountDto) => void;
}): JSX.Element {
  const active = selectedAccount === account.id;
  const label = account.displayName || account.emailAddress;

  function handleEdit(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onEdit(account);
  }

  return (
    <div className="space-y-1">
      <div
        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${
          active ? 'bg-accent-soft' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onToggle(account.id)}
          className="text-text-muted hover:text-text flex h-8 w-8 items-center justify-center rounded-md transition"
          aria-label={expanded ? 'Contraer carpetas' : 'Expandir carpetas'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => onSelectFolder(account.id, 'INBOX')}
          className="min-w-0 flex-1 text-left"
        >
          <p className={`truncate text-sm ${active ? 'text-text font-medium' : 'text-text'}`}>
            {label}
          </p>
          <p className="text-text-muted truncate text-xs">{account.emailAddress}</p>
        </button>

        <button
          type="button"
          onClick={handleEdit}
          className="text-text-muted hover:text-text flex h-8 w-8 items-center justify-center rounded-md transition"
          aria-label={`Editar ${account.emailAddress}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {expanded ? (
        <FolderList
          accountId={account.id}
          selectedAccount={selectedAccount}
          selectedFolder={selectedFolder}
          onSelect={onSelectFolder}
        />
      ) : null}
    </div>
  );
}

export default function MailPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const [page, setPage] = useState(1);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccountDto | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  const accountsQuery = useQuery({
    queryKey: ['mail', 'accounts'],
    queryFn: listAccounts,
  });

  const messagesQuery = useQuery({
    queryKey: ['mail', 'messages', selectedAccount, selectedFolder, page, PAGE_SIZE],
    queryFn: () => listMessages(selectedAccount ?? '', selectedFolder, page, PAGE_SIZE),
    enabled: Boolean(selectedAccount),
  });

  const messageDetailQuery = useQuery({
    queryKey: ['mail', 'message', selectedAccount, selectedFolder, selectedUid],
    queryFn: () => getMessage(selectedAccount ?? '', selectedUid ?? 0, selectedFolder),
    enabled: Boolean(selectedAccount && selectedUid !== null),
  });

  useEffect(() => {
    const accounts = accountsQuery.data;
    if (!accounts || accounts.length === 0) return;

    const selectedStillExists = selectedAccount
      ? accounts.some((account) => account.id === selectedAccount)
      : false;
    if (selectedStillExists) return;

    const first = accounts[0];
    if (!first) return;

    setSelectedAccount(first.id);
    setSelectedFolder('INBOX');
    setSelectedUid(null);
    setExpandedAccounts((current) => ({ ...current, [first.id]: true }));
  }, [accountsQuery.data, selectedAccount]);

  useEffect(() => {
    setPage(1);
    setSelectedUid(null);
  }, [selectedAccount, selectedFolder]);

  const accounts = accountsQuery.data ?? [];
  const messageList = messagesQuery.data;
  const totalPages = messageList
    ? Math.max(1, Math.ceil(messageList.total / messageList.pageSize))
    : 1;
  const currentMessage = messageDetailQuery.data;
  const safeHtml = useMemo(
    () => (currentMessage?.html ? sanitizeHtml(currentMessage.html) : null),
    [currentMessage?.html],
  );

  async function markMessageReadIfNeeded(message: MessageListItemDto): Promise<void> {
    if (!selectedAccount || !isUnread(message)) return;

    await setFlags(selectedAccount, message.uid, { folder: selectedFolder, seen: true });

    await queryClient.invalidateQueries({
      queryKey: ['mail', 'messages', selectedAccount, selectedFolder, page, PAGE_SIZE],
    });
    await queryClient.invalidateQueries({
      queryKey: ['mail', 'message', selectedAccount, selectedFolder, message.uid],
    });
  }

  function handleSelectFolder(accountId: string, folder: string): void {
    setSelectedAccount(accountId);
    setSelectedFolder(folder);
    setExpandedAccounts((current) => ({ ...current, [accountId]: true }));
  }

  function toggleAccount(accountId: string): void {
    setExpandedAccounts((current) => ({ ...current, [accountId]: !current[accountId] }));
  }

  return (
    <>
      <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] overflow-hidden lg:-mx-8 lg:-my-8">
        <aside className="border-border bg-surface w-56 shrink-0 border-r">
          <div className="border-border flex h-16 items-center justify-between border-b px-4">
            <div>
              <h1 className="text-base font-semibold">Correo</h1>
              <p className="text-text-muted text-xs">Cuentas conectadas</p>
            </div>
          </div>

          <div className="flex h-[calc(100%-4rem)] flex-col overflow-hidden">
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {accountsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="bg-surface-muted h-14 animate-pulse rounded-lg" />
                ))
              ) : accountsQuery.isError ? (
                <p className="text-danger px-1 text-sm">No se pudieron cargar las cuentas.</p>
              ) : accounts.length === 0 ? (
                <div className="px-1 pt-2">
                  <p className="text-sm font-medium">No hay cuentas configuradas.</p>
                  <p className="text-text-muted mt-1 text-sm">
                    Anade la primera cuenta corporativa para leer el correo.
                  </p>
                </div>
              ) : (
                accounts.map((account) => (
                  <AccountSection
                    key={account.id}
                    account={account}
                    expanded={Boolean(expandedAccounts[account.id])}
                    selectedAccount={selectedAccount}
                    selectedFolder={selectedFolder}
                    onToggle={toggleAccount}
                    onSelectFolder={handleSelectFolder}
                    onEdit={setEditingAccount}
                  />
                ))
              )}
            </div>

            <div className="border-border border-t p-3">
              <button
                type="button"
                onClick={() => setAddAccountOpen(true)}
                className="text-accent hover:bg-accent-soft flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" />
                Anadir cuenta
              </button>
            </div>
          </div>
        </aside>

        <section className="border-border bg-surface flex w-80 shrink-0 flex-col border-r">
          <div className="border-border flex h-16 items-center justify-between border-b px-4">
            <div>
              <h2 className="text-base font-semibold">{messageList?.folder ?? selectedFolder}</h2>
              <p className="text-text-muted text-sm">{messageList?.total ?? 0} mensajes</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selectedAccount ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="text-text-muted text-sm">Selecciona una cuenta para ver mensajes.</p>
              </div>
            ) : messagesQuery.isLoading ? (
              <div>
                {Array.from({ length: 5 }).map((_, index) => (
                  <MessageRowSkeleton key={index} />
                ))}
              </div>
            ) : messagesQuery.isError ? (
              <div className="p-6 text-center">
                <p className="text-sm">No se pudieron cargar los mensajes.</p>
              </div>
            ) : messageList && messageList.messages.length > 0 ? (
              <div>
                {messageList.messages.map((message) => {
                  const unread = isUnread(message);
                  const active = selectedUid === message.uid;
                  return (
                    <button
                      key={message.uid}
                      type="button"
                      onClick={() => {
                        setSelectedUid(message.uid);
                        void markMessageReadIfNeeded(message);
                      }}
                      className={`border-border flex w-full items-start gap-3 border-b px-4 py-3 text-left transition last:border-b-0 ${
                        active ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                          unread ? 'bg-accent' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className={`truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}
                          >
                            {formatPrimaryAddress(message.from)}
                          </p>
                          <span className="text-text-muted shrink-0 text-xs">
                            {formatRelativeDate(message.date)}
                          </span>
                        </div>
                        <p
                          className={`truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}
                        >
                          {message.subject ?? 'Sin asunto'}
                        </p>
                        <p className="text-text-muted truncate text-sm">{message.snippet}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="text-text-muted text-sm">No hay mensajes en esta carpeta.</p>
              </div>
            )}
          </div>

          <div className="border-border flex items-center justify-between border-t px-4 py-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || !selectedAccount}
              className="border-border bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-text-muted text-sm">
              Pagina {messageList?.page ?? page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={!selectedAccount || page >= totalPages}
              className="border-border bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </section>

        <section className="bg-surface flex min-w-0 flex-1 flex-col">
          {!selectedUid ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <h2 className="text-xl font-semibold">Selecciona un mensaje para leerlo</h2>
                <p className="text-text-muted mt-2 text-sm">
                  El contenido del correo aparecera aqui.
                </p>
              </div>
            </div>
          ) : messageDetailQuery.isLoading ? (
            <div className="space-y-4 p-6">
              <div className="bg-surface-muted h-8 w-1/2 animate-pulse rounded-md" />
              <div className="bg-surface-muted h-24 animate-pulse rounded-md" />
              <div className="bg-surface-muted h-80 animate-pulse rounded-md" />
            </div>
          ) : messageDetailQuery.isError || !currentMessage ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm">No se pudo cargar el mensaje.</p>
            </div>
          ) : (
            <>
              <div className="border-border border-b px-6 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled
                    title="Proximamente"
                    className="border-border bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Responder
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Proximamente"
                    className="border-border bg-surface-muted h-9 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reenviar
                  </button>
                </div>

                <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                  {currentMessage.subject ?? 'Sin asunto'}
                </h2>

                <div className="mt-4 grid gap-3 text-sm">
                  <div>
                    <span className="text-text-muted mr-2 font-medium">De:</span>
                    <span>{formatAddressList(currentMessage.from)}</span>
                  </div>
                  <div>
                    <span className="text-text-muted mr-2 font-medium">Para:</span>
                    <span>{formatAddressList(currentMessage.to)}</span>
                  </div>
                  {currentMessage.cc.length > 0 ? (
                    <div>
                      <span className="text-text-muted mr-2 font-medium">CC:</span>
                      <span>{formatAddressList(currentMessage.cc)}</span>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-text-muted mr-2 font-medium">Fecha:</span>
                    <span>{formatDateTime(currentMessage.date)}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {currentMessage.attachments.length > 0 ? (
                  <div className="border-border mb-6 rounded-lg border p-4">
                    <h3 className="mb-3 text-sm font-semibold">Adjuntos</h3>
                    <div className="space-y-2">
                      {currentMessage.attachments.map((attachment) => (
                        <div
                          key={attachment.partId}
                          className="bg-surface-muted flex items-center gap-3 rounded-md px-3 py-2 text-sm"
                        >
                          <Paperclip className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {attachment.filename ?? 'Adjunto sin nombre'}
                          </span>
                          <span className="text-text-muted shrink-0">
                            {formatBytes(attachment.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {safeHtml ? (
                  <iframe
                    title="Contenido del mensaje"
                    srcDoc={safeHtml}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ minHeight: 400 }}
                  />
                ) : currentMessage.text ? (
                  <pre className="bg-surface-muted whitespace-pre-wrap rounded-lg p-4 text-sm leading-6">
                    {currentMessage.text}
                  </pre>
                ) : (
                  <p className="text-text-muted text-sm">
                    Este mensaje no tiene contenido visible.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <AddAccountDialog open={addAccountOpen} onClose={() => setAddAccountOpen(false)} />
      <EditAccountDialog
        account={editingAccount}
        open={editingAccount !== null}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
