import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import { Shield, Users, ListOrdered, BarChart3, Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function AdminStats() {
  const { data: stats, isLoading } = trpc.admin.dashboardStats.useQuery();

  const cards = [
    { label: "Usuários", value: stats?.totalUsers ?? 0, icon: Users, gradient: "stat-card-purple" },
    { label: "Na Fila", value: stats?.totalQueue ?? 0, icon: ListOrdered, gradient: "stat-card-blue" },
    { label: "Sucesso", value: stats?.totalSuccess ?? 0, icon: BarChart3, gradient: "stat-card-green" },
    { label: "Falhas", value: stats?.totalFailed ?? 0, icon: BarChart3, gradient: "stat-card-red" },
    { label: "Contas", value: stats?.totalAccounts ?? 0, icon: Users, gradient: "stat-card-orange" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={`${card.gradient} rounded-xl p-4 text-white shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <card.icon className="h-5 w-5 opacity-80" />
          </div>
          <div className="text-2xl font-bold">
            {isLoading ? "..." : card.value.toLocaleString("pt-BR")}
          </div>
          <div className="text-sm opacity-80 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

function AddCreditsModal({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(1000);
  const utils = trpc.useUtils();
  const mutation = trpc.credits.addCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`${amount} créditos adicionados. Novo saldo: ${data.credits}`);
      utils.admin.listUsers.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Adicionar Créditos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Adicionando créditos para: <span className="text-foreground font-medium">{userName}</span>
          </p>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Quantidade</label>
            <Input
              type="number"
              min={1}
              max={100000}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="bg-secondary/50"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate({ userId, amount })}
            disabled={mutation.isPending || amount <= 0}
          >
            <Coins className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersList() {
  const { data, isLoading } = trpc.admin.listUsers.useQuery();
  const [addCreditsUser, setAddCreditsUser] = useState<{ id: number; name: string } | null>(null);
  const utils = trpc.useUtils();

  const setRoleMutation = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      toast.success("Role atualizada");
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Créditos</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Último Login</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td>
                </tr>
              )}
              {data?.users?.map((user) => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="p-3 text-xs">{user.id}</td>
                  <td className="p-3">{user.name ?? "-"}</td>
                  <td className="p-3 text-xs">{user.email ?? "-"}</td>
                  <td className="p-3">
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono">{user.credits.toLocaleString("pt-BR")}</td>
                  <td className="p-3 text-xs">
                    {new Date(user.lastSignedIn).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddCreditsUser({ id: user.id, name: user.name ?? "Usuário" })}
                      >
                        <Coins className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRoleMutation.mutate({
                            userId: user.id,
                            role: user.role === "admin" ? "user" : "admin",
                          })
                        }
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addCreditsUser && (
        <AddCreditsModal
          userId={addCreditsUser.id}
          userName={addCreditsUser.name}
          open={!!addCreditsUser}
          onClose={() => setAddCreditsUser(null)}
        />
      )}
    </>
  );
}

function QueueOverview() {
  const { data: queueItems, isLoading } = trpc.admin.listQueue.useQuery();

  const statusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Pendente" },
      processing: { variant: "default", label: "Processando" },
      completed: { variant: "outline", label: "Concluído" },
      cancelled: { variant: "secondary", label: "Cancelado" },
      failed: { variant: "destructive", label: "Falhou" },
    };
    const v = variants[status] ?? { variant: "secondary" as const, label: status };
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
              <th className="text-left p-3 font-medium text-muted-foreground">User ID</th>
              <th className="text-left p-3 font-medium text-muted-foreground">URL</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Qtd</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Processados</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {queueItems?.map((item) => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                <td className="p-3 text-xs">{item.id}</td>
                <td className="p-3 text-xs">{item.userId}</td>
                <td className="p-3 text-xs max-w-[200px] truncate">{item.inviteUrl}</td>
                <td className="p-3">{item.quantity}</td>
                <td className="p-3">{item.processed}/{item.quantity}</td>
                <td className="p-3">{statusBadge(item.status)}</td>
                <td className="p-3 text-xs">{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Painel Admin
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie usuários, fila e créditos
          </p>
        </div>

        <AdminStats />

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="queue">Fila Global</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersList />
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            <QueueOverview />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
