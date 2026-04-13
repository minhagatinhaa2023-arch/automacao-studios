import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { Key, Plus, Copy, Trash2, Ban, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function ApiDocumentation() {
  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5" />
        Documentação da API
      </h3>
      <div className="space-y-6 text-sm">
        <div>
          <h4 className="font-medium mb-2 text-primary">Autenticação</h4>
          <p className="text-muted-foreground mb-2">
            Todas as requisições devem incluir o header de autenticação:
          </p>
          <code className="bg-secondary/50 px-3 py-2 rounded block text-xs font-mono">
            Authorization: Bearer YOUR_API_KEY
          </code>
        </div>

        <div>
          <h4 className="font-medium mb-2 text-primary">Endpoints</h4>
          <div className="space-y-3">
            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs">GET</Badge>
                <code className="text-xs">/api/v1/balance</code>
              </div>
              <p className="text-xs text-muted-foreground">Consultar saldo de créditos</p>
            </div>

            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs">POST</Badge>
                <code className="text-xs">/api/v1/signup</code>
              </div>
              <p className="text-xs text-muted-foreground">Iniciar cadastro automatizado</p>
              <code className="bg-secondary/50 px-2 py-1 rounded block text-xs font-mono mt-2">
                {`{ "inviteUrl": "https://manus.im/invitation/...", "quantity": 1 }`}
              </code>
            </div>

            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs">GET</Badge>
                <code className="text-xs">/api/v1/status/:queueId</code>
              </div>
              <p className="text-xs text-muted-foreground">Verificar status de um cadastro</p>
            </div>

            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs">POST</Badge>
                <code className="text-xs">/api/v1/cancel/:queueId</code>
              </div>
              <p className="text-xs text-muted-foreground">Cancelar um cadastro pendente</p>
            </div>

            <div className="bg-secondary/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs">GET</Badge>
                <code className="text-xs">/api/v1/accounts</code>
              </div>
              <p className="text-xs text-muted-foreground">Listar contas criadas</p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2 text-primary">Exemplo (cURL)</h4>
          <pre className="bg-secondary/50 px-3 py-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`curl -X POST \\
  https://seu-dominio.com/api/v1/signup \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"inviteUrl":"https://manus.im/invitation/abc123","quantity":1}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.apiKeys.list.useQuery();
  const [label, setLabel] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      setLabel("");
      utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      toast.success("API Key revogada");
      utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.apiKeys.delete.useMutation({
    onSuccess: () => {
      toast.success("API Key removida");
      utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API Key copiada!");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Key className="h-6 w-6" />
              API Keys
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie suas chaves de API para integração
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova API Key
          </Button>
        </div>

        {/* Keys List */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Label</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Key</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Criada em</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading && (!keys || keys.length === 0) && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Nenhuma API Key criada
                    </td>
                  </tr>
                )}
                {keys?.map((key) => (
                  <tr key={key.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="p-3">{key.label ?? "-"}</td>
                    <td className="p-3 font-mono text-xs">
                      {key.key.substring(0, 12)}...{key.key.substring(key.key.length - 6)}
                    </td>
                    <td className="p-3">
                      <Badge variant={key.active ? "default" : "secondary"}>
                        {key.active ? "Ativa" : "Revogada"}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {new Date(key.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyKey(key.key)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {key.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeMutation.mutate({ keyId: key.id })}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate({ keyId: key.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* API Documentation */}
        <ApiDocumentation />
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setNewKey(null);
        }
      }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{newKey ? "API Key Criada" : "Nova API Key"}</DialogTitle>
          </DialogHeader>
          {!newKey ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  Label (opcional)
                </label>
                <Input
                  placeholder="Minha integração"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="bg-secondary/50"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => createMutation.mutate({ label: label || undefined })}
                  disabled={createMutation.isPending}
                >
                  Gerar Key
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-yellow-400">
                Copie esta chave agora. Ela não será exibida novamente por completo.
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-secondary/50 px-3 py-2 rounded text-xs font-mono flex-1 break-all">
                  {newKey}
                </code>
                <Button variant="ghost" size="sm" onClick={() => copyKey(newKey)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setShowCreateDialog(false); setNewKey(null); }}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
