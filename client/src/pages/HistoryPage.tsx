import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, History } from "lucide-react";

export default function HistoryPage() {
  const utils = trpc.useUtils();
  const { data: history, isLoading } = trpc.history.list.useQuery();
  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro removido");
      utils.history.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" />
            Histórico de Cadastros
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Veja todos os cadastros realizados e seus resultados
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
                  <th className="text-left p-3 font-medium text-muted-foreground">Motivo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading && (!history || history.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Nenhum registro encontrado
                    </td>
                  </tr>
                )}
                {history?.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="p-3 text-xs">
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3 font-mono text-xs">{item.email ?? "-"}</td>
                    <td className="p-3 font-mono text-xs">{item.phone ?? "-"}</td>
                    <td className="p-3">
                      <Badge variant={item.status === "success" ? "default" : "destructive"}>
                        {item.status === "success" ? "Sucesso" : "Falha"}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {item.reason ?? "-"}
                    </td>
                    <td className="p-3">
                      {item.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate({ historyId: item.id })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
