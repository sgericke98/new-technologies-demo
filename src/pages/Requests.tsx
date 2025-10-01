import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Requests() {
  const { toast } = useToast();

  const { data: requests = [], refetch } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select(`
          *,
          requester:profiles!requester_user_id(name, email),
          account:accounts(name),
          seller:sellers(name)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const handleApprove = async (requestId: string) => {
    const { error } = await supabase
      .from("requests")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error approving request",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request approved",
        description: "The request has been approved successfully.",
      });
      refetch();
    }
  };

  const handleReject = async (requestId: string) => {
    const { error } = await supabase
      .from("requests")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error rejecting request",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request rejected",
        description: "The request has been rejected.",
      });
      refetch();
    }
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const decidedRequests = requests.filter(r => r.status !== "pending");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">Requests & Approvals</h1>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Pending Requests ({pendingRequests.length})</CardTitle>
            <CardDescription>
              Review and approve or reject manager requests for account reassignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No pending requests at this time.
              </p>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map(request => (
                  <Card key={request.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {request.type.toUpperCase()} Request
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Account: {request.account?.name}
                          {request.seller && ` → ${request.seller.name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested by: {request.requester?.name} ({request.requester?.email})
                        </p>
                        {request.reason && (
                          <p className="text-xs text-muted-foreground italic">
                            Reason: {request.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(request.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(request.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Request History</CardTitle>
            <CardDescription>
              Previously approved or rejected requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decidedRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No request history yet.
              </p>
            ) : (
              <div className="space-y-4">
                {decidedRequests.map(request => (
                  <Card key={request.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {request.type.toUpperCase()} Request
                          </p>
                          <Badge variant={request.status === "approved" ? "default" : "destructive"}>
                            {request.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Account: {request.account?.name}
                          {request.seller && ` → ${request.seller.name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested by: {request.requester?.name}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
