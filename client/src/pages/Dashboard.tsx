import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Coins,
  CheckCircle,
  Users,
  XCircle,
  BarChart3,
  Play,
  Square,
  Monitor,
  ScrollText,
  Loader2,
  CreditCard,
} from "lucide-react";

function StatsCards() {
  const { data: stats, isLoading } = trpc.credits.stats.useQuery();

  const cards = [
    {
      label: "Créditos",
      value: stats?.credits ?? 0,
      icon: Coins,
      gradient: "stat-card-purple",
    },
    {
      label: "Sucesso",
      value: stats?.success ?? 0,
      icon: CheckCircle,
      gradient: "stat-card-green",
    },
    {
      label: "Contas Criadas",
      value: stats?.success ?? 0,
      icon: Users,
      gradient: "stat-card-blue",
    },
    {
      label: "Falhas",
      value: stats?.failed ?? 0,
      icon: XCircle,
      gradient: "stat-card-red",
    },
    {
      label: "Total",
      value: stats?.total ?? 0,
      icon: BarChart3,
      gradient: "stat-card-orange",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.gradient} rounded-xl p-4 text-white shadow-lg`}
        >
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

function RechargeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const packages = [
    { credits: 1000, label: "1.000 créditos", price: "R$ 5,00" },
    { credits: 5000, label: "5.000 créditos", price: "R$ 20,00" },
    { credits: 10000, label: "10.000 créditos", price: "R$ 35,00" },
    { credits: 50000, label: "50.000 créditos", price: "R$ 150,00" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Recarregar Créditos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Selecione um pacote de créditos para recarregar.
          </p>
          {packages.map((pkg) => (
            <button
              key={pkg.credits}
              className="w-full flex items-center justify-between bg-secondary/50 hover:bg-secondary/80 rounded-lg p-4 transition-colors text-left"
              onClick={() => {
                toast.info("Pagamentos ainda não estão habilitados. Contate o admin para adicionar créditos.");
                onClose();
              }}
            >
              <div>
                <div className="font-medium">{pkg.label}</div>
                <div className="text-xs text-muted-foreground">
                  {pkg.credits / 500} cadastros
                </div>
              </div>
              <div className="text-primary font-semibold">{pkg.price}</div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <p className="text-xs text-muted-foreground w-full text-center">
            Pagamentos serão habilitados em breve. Por enquanto, contate o administrador.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignupForm({ onQueueCreated }: { onQueueCreated: (id: number) => void }) {
  const [url, setUrl] = useState("");
  const [quantity, setQuantity] = useState(1);

  const utils = trpc.useUtils();
  const startMutation = trpc.queue.start.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onQueueCreated(data.queueId);
      utils.credits.stats.invalidate();
      utils.queue.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleStart = () => {
    if (!url.trim()) {
      toast.error("Insira o link de convite Manus");
      return;
    }
    startMutation.mutate({ inviteUrl: url.trim(), quantity });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">
          Link de Convite Manus
        </label>
        <Input
          placeholder="https://manus.im/invitation/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="bg-secondary/50 border-border"
        />
      </div>
      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">
          Quantidade de Cadastros (max 10)
        </label>
        <Input
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))
          }
          className="bg-secondary/50 border-border w-32"
        />
      </div>
      <div className="text-sm text-muted-foreground">
        Custo:{" "}
        <span className="text-foreground font-semibold">
          {quantity * 500}
        </span>{" "}
        créditos
      </div>
      <Button
        onClick={handleStart}
        disabled={startMutation.isPending}
        className="bg-primary hover:bg-primary/90"
      >
        {startMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Play className="h-4 w-4 mr-2" />
        )}
        Iniciar Cadastro
      </Button>
    </div>
  );
}

function BotViewer({ queueId }: { queueId: number | null }) {
  const { data: botLogs } = trpc.history.botLogs.useQuery(
    { queueId: queueId ?? 0 },
    { enabled: !!queueId, refetchInterval: 1500 }
  );

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [botLogs?.logs]);

  if (!queueId) {
    return (
      <div className="vnc-viewer rounded-xl h-full min-h-[400px] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Monitor className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum bot ativo</p>
          <p className="text-xs mt-1">
            Inicie um cadastro para ver o bot em ação
          </p>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="vnc" className="w-full h-full flex flex-col">
      <TabsList className="bg-secondary/50 shrink-0">
        <TabsTrigger value="vnc" className="gap-1.5">
          <Monitor className="h-3.5 w-3.5" />
          VNC
        </TabsTrigger>
        <TabsTrigger value="logs" className="gap-1.5">
          <ScrollText className="h-3.5 w-3.5" />
          Logs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="vnc" className="flex-1 mt-2">
        <div className="vnc-viewer rounded-xl h-full min-h-[400px] relative overflow-hidden">
          <div className="absolute inset-0 bg-black p-4 font-mono text-xs text-green-400 overflow-auto">
            <div className="mb-2 text-green-600">
              ╔══════════════════════════════════════════════╗
            </div>
            <div className="text-green-600">
              ║ Automação Studios - Bot VNC Viewer
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;║
            </div>
            <div className="mb-3 text-green-600">
              ╚══════════════════════════════════════════════╝
            </div>
            {botLogs?.logs?.map((log, i) => (
              <div key={i} className="py-0.5">
                <span className="text-green-600/60">
                  [{new Date().toLocaleTimeString()}]
                </span>{" "}
                <span
                  className={
                    log.includes("✓")
                      ? "text-green-400"
                      : log.includes("✗")
                      ? "text-red-400"
                      : "text-green-300"
                  }
                >
                  {log}
                </span>
              </div>
            ))}
            {botLogs?.status === "running" && (
              <div className="py-0.5 animate-pulse">
                <span className="text-green-600/60">
                  [{new Date().toLocaleTimeString()}]
                </span>{" "}
                <span className="text-yellow-400">
                  {botLogs?.currentStep ?? "Processando..."}
                </span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-secondary/80 backdrop-blur px-3 py-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  botLogs?.status === "running"
                    ? "bg-green-500 animate-pulse"
                    : botLogs?.status === "completed"
                    ? "bg-blue-500"
                    : "bg-yellow-500"
                }`}
              />
              <span className="text-muted-foreground">
                {botLogs?.status === "running"
                  ? "Bot ativo"
                  : botLogs?.status === "completed"
                  ? "Concluído"
                  : "Aguardando"}
              </span>
            </div>
            <span className="text-muted-foreground">Queue #{queueId}</span>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="logs" className="flex-1 mt-2">
        <div className="bg-card rounded-xl border border-border h-full min-h-[400px] overflow-auto p-4 terminal-log">
          {botLogs?.logs?.map((log, i) => (
            <div key={i} className="py-0.5 text-sm">
              <span className="text-muted-foreground mr-2">
                [{String(i + 1).padStart(3, "0")}]
              </span>
              <span
                className={
                  log.includes("✓")
                    ? "text-green-400"
                    : log.includes("✗")
                    ? "text-red-400"
                    : "text-foreground"
                }
              >
                {log}
              </span>
            </div>
          ))}
          {(!botLogs?.logs || botLogs.logs.length === 0) && (
            <div className="text-muted-foreground text-center mt-20">
              Nenhum log disponível
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function QueueList({ onSelectQueue }: { onSelectQueue: (id: number) => void }) {
  const { data: queueItems, isLoading } = trpc.queue.list.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const utils = trpc.useUtils();

  const cancelMutation = trpc.queue.cancel.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.credits.stats.invalidate();
      utils.queue.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusBadge = (status: string) => {
    const variants: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      pending: { variant: "secondary", label: "Pendente" },
      processing: { variant: "default", label: "Processando" },
      completed: { variant: "outline", label: "Concluído" },
      cancelled: { variant: "secondary", label: "Cancelado" },
      failed: { variant: "destructive", label: "Falhou" },
    };
    const v = variants[status] ?? {
      variant: "secondary" as const,
      label: status,
    };
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="text-muted-foreground text-sm">Carregando fila...</div>
    );
  }

  if (!queueItems?.length) {
    return (
      <div className="text-muted-foreground text-sm text-center py-8">
        Nenhum item na fila
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {queueItems.map((item) => (
        <div
          key={item.id}
          className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-colors cursor-pointer"
          onClick={() => onSelectQueue(item.id)}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Fila #{item.id}</span>
              {statusBadge(item.status)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("pt-BR")}
              </span>
              {item.status === "pending" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelMutation.mutate({ queueId: item.id });
                  }}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground truncate mb-2">
            {item.inviteUrl}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>
              Processados: {item.processed}/{item.quantity}
            </span>
            {item.failed > 0 && (
              <span className="text-destructive">Falhas: {item.failed}</span>
            )}
          </div>
          {item.status === "processing" && (
            <Progress
              value={(item.processed / item.quantity) * 100}
              className="mt-2 h-1.5"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [activeQueueId, setActiveQueueId] = useState<number | null>(null);
  const [showRecharge, setShowRecharge] = useState(false);

  const { data: queueItems } = trpc.queue.list.useQuery(undefined, {
    refetchInterval: 3000,
  });

  useEffect(() => {
    const processing = queueItems?.find((q) => q.status === "processing");
    if (processing) {
      setActiveQueueId(processing.id);
    }
  }, [queueItems]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Créditos Manus</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie seus créditos e cadastros automatizados
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowRecharge(true)}
            className="gap-2"
          >
            <CreditCard className="h-4 w-4" />
            Recarregar
          </Button>
        </div>

        {/* Stats Cards */}
        <StatsCards />

        {/* Main Content: Tabs */}
        <Tabs defaultValue="signup" className="w-full">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="signup">Criar Contas Manus</TabsTrigger>
            <TabsTrigger value="queue">Fila</TabsTrigger>
          </TabsList>

          <TabsContent value="signup" className="mt-4">
            <ResizablePanelGroup
              direction="horizontal"
              className="min-h-[500px] rounded-xl border border-border"
            >
              <ResizablePanel defaultSize={40} minSize={30}>
                <div className="p-6 h-full">
                  <h2 className="text-lg font-semibold mb-4">
                    Novo Cadastro Automatizado
                  </h2>
                  <SignupForm onQueueCreated={setActiveQueueId} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="p-4 h-full">
                  <h2 className="text-lg font-semibold mb-4">
                    Bot em Tempo Real
                  </h2>
                  <BotViewer queueId={activeQueueId} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </TabsContent>

          <TabsContent value="queue" className="mt-4">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold mb-4">
                Fila de Processamento
              </h2>
              <QueueList onSelectQueue={setActiveQueueId} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <RechargeModal open={showRecharge} onClose={() => setShowRecharge(false)} />
    </DashboardLayout>
  );
}
