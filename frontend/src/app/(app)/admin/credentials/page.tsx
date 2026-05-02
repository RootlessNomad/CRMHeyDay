'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { CreateCredentialDialog } from '@/components/credentials/CreateCredentialDialog';
import { CredentialsTable } from '@/components/credentials/CredentialsTable';
import { DeleteCredentialDialog } from '@/components/credentials/DeleteCredentialDialog';
import { RotateCredentialDialog } from '@/components/credentials/RotateCredentialDialog';
import { ApiError } from '@/lib/api/client';
import {
  listCredentials,
  setCredentialActive,
  testCredential,
  type CredentialDto,
} from '@/lib/api/credentials';

export default function AdminCredentialsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [rotatingCred, setRotatingCred] = useState<CredentialDto | null>(null);
  const [deletingCred, setDeletingCred] = useState<CredentialDto | null>(null);

  const credentialsQuery = useQuery({
    queryKey: ['credentials'],
    queryFn: listCredentials,
  });

  async function refreshCredentials(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['credentials'] });
  }

  async function handleToggleActive(cred: CredentialDto): Promise<void> {
    try {
      await setCredentialActive(cred.id, !cred.isActive);
      await refreshCredentials();
      toast.success(cred.isActive ? 'Credencial desactivada.' : 'Credencial activada.');
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
        return;
      }
      toast.error('No se pudo actualizar la credencial.');
    }
  }

  async function handleTest(cred: CredentialDto): Promise<void> {
    try {
      const { jobId } = await testCredential(cred.id);
      toast.success(`Test encolado (job: ${jobId})`);
    } catch {
      toast.error('No se pudo encolar el test.');
    }
  }

  const credentials = credentialsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Credenciales y API keys</h1>
          <p className="text-text-muted mt-1 text-sm">
            Gestiona las integraciones de terceros de forma segura.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Añadir credencial
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {credentialsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : credentialsQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar las credenciales.</p>
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">Sin credenciales configuradas</h2>
              <p className="text-text-muted mt-1 text-sm">
                Añade la primera API key para conectar integraciones de terceros.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
              Añadir credencial
            </button>
          </div>
        ) : (
          <CredentialsTable
            credentials={credentials}
            onRotate={setRotatingCred}
            onToggleActive={(cred) => {
              void handleToggleActive(cred);
            }}
            onDelete={setDeletingCred}
            onTest={(cred) => {
              void handleTest(cred);
            }}
          />
        )}
      </div>

      <CreateCredentialDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          toast.success('Credencial añadida.');
          void refreshCredentials();
        }}
      />

      <RotateCredentialDialog
        open={rotatingCred !== null}
        credential={rotatingCred}
        onClose={() => setRotatingCred(null)}
        onRotated={() => {
          setRotatingCred(null);
          toast.success('Secreto rotado.');
          void refreshCredentials();
        }}
      />

      <DeleteCredentialDialog
        open={deletingCred !== null}
        credential={deletingCred}
        onClose={() => setDeletingCred(null)}
        onDeleted={() => {
          void refreshCredentials();
        }}
      />
    </div>
  );
}
