'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function RequestsContent() {
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeDisplay = (type: string) => {
    switch (type) {
      case "assign":
        return "Assign Account";
      case "unassign":
        return "Unassign Account";
      case "pin":
        return "Pin Account";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Account Assignment Requests</CardTitle>
          <CardDescription>
            Review and approve requests for account assignments and changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No requests found
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request: any) => (
                <Card key={request.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{getTypeDisplay(request.type)}</h4>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <strong>Account:</strong> {request.account?.name || "Unknown"}
                      </p>
                      {request.seller && (
                        <p className="text-sm text-muted-foreground">
                          <strong>Seller:</strong> {request.seller.name}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        <strong>Requester:</strong> {request.requester?.name || request.requester?.email || "Unknown"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Reason:</strong> {request.reason}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Created:</strong> {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>
                    
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request.id)}
                          className="bg-green-600 hover:bg-green-700"
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
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
