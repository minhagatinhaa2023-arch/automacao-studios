import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { Eye, EyeOff, Copy, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function AccountDetailsModal({
  accountId,
  open,
  onClose,
}: {
  accountId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data: account } = trpc.history.accountDetails.useQuery(
    { accountId },
    { enabled: open }
  );
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Detalhes da Conta</DialogTitle>
        </DialogHeader>
        {account && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="bg-secondary/50 px-3 py-1.5 rounded text-sm flex-1">
                  {account.email}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(account.email, "Email")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Senha</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="bg-secondary/50 px-3 py-1.5 rounded text-sm flex-1">
                  {showPassword ? account.password : "••••••••••"}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(account.password, "Senha")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {account.phone && (
              <div>
                <label className="text-xs text-muted-foreground">Telefone</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-secondary/50 px-3 py-1.5 rounded text-sm flex-1">
                    {account.phone}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(account.phone!, "Telefone")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <div className="mt-1">
                <Badge
                  variant={account.status === "success" ? "default" : "destructive"}
                >
                  {account.status === "success" ? "Ativa" : account.status}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AccountsPage() {
  const { data: accounts, isLoading } = trpc.history.accounts.useQuery();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6" />
            Contas Manus
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Contas criadas automaticamente pelo bot
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Telefone</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
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
                {!isLoading && (!accounts || accounts.length === 0) && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Nenhuma conta criada ainda
                    </td>
                  </tr>
                )}
                {accounts?.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="p-3 text-xs">
                      {new Date(account.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3 font-mono text-xs">{account.email}</td>
                    <td className="p-3 font-mono text-xs">{account.phone ?? "-"}</td>
                    <td className="p-3">
                      <Badge
                        variant={account.status === "success" ? "default" : "secondary"}
                      >
                        {account.status === "success" ? "Ativa" : account.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAccount(account.id)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedAccount && (
        <AccountDetailsModal
          accountId={selectedAccount}
          open={!!selectedAccount}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </DashboardLayout>
  );
}
