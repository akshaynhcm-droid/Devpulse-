import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  Trash2,
  FileJson,
  AlertCircle,
  Zap,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Collections() {
  const [, navigate] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"postman" | "openapi">(
    "postman"
  );
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");

  const {
    data: collections,
    isLoading,
    refetch,
  } = trpc.collections.list.useQuery();
  const createMutation = trpc.collections.create.useMutation();
  const deleteMutation = trpc.collections.delete.useMutation();

  const filteredCollections = useMemo(() => {
    if (!collections?.collections) return [];

    let filtered = collections.collections;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query)
      );
    }

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "oldest":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case "newest":
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    });
  }, [collections, searchQuery, sortBy]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error(
        "Only JSON files are supported (Postman v2.1 or OpenAPI 3.x)."
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }

    setIsUploading(true);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        toast.error("Invalid JSON file. Please check the file format.");
        return;
      }

      await createMutation.mutateAsync({
        name: collectionName || file.name.replace(/\.[^/.]+$/, ""),
        format: selectedFormat,
        data,
      });

      toast.success("Collection imported successfully!");
      setCollectionName("");
      // Reset file input
      event.target.value = "";
      refetch();
    } catch (error) {
      toast.error("Failed to import collection. Please check the file format.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialogId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteDialogId });
      toast.success("Collection deleted successfully!");
      setDeleteDialogId(null);
      refetch();
    } catch {
      toast.error("Failed to delete collection.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">API Collections</h1>
        <p className="text-muted-foreground">
          Import and manage your Postman and OpenAPI collections
        </p>
      </div>

      {/* Upload Section */}
      <Card className="p-8 space-y-6 border-2 border-dashed border-border/50 hover:border-accent/50 transition-colors">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Import Collection
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Collection Name (optional)
              </label>
              <Input
                placeholder="My API Collection"
                value={collectionName}
                onChange={e => setCollectionName(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Format
              </label>
              <div className="flex gap-4">
                {["postman", "openapi"].map(format => (
                  <label
                    key={format}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      value={format}
                      checked={selectedFormat === format}
                      onChange={e =>
                        setSelectedFormat(
                          e.target.value as "postman" | "openapi"
                        )
                      }
                      disabled={isUploading}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium capitalize">
                      {format}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Upload File
              </label>
              <label className="flex items-center justify-center gap-3 px-6 py-4 border-2 border-dashed border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {isUploading
                      ? "Uploading..."
                      : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JSON file up to 10MB
                  </p>
                </div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Collections List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">
            Your Collections ({filteredCollections.length})
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search collections..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading collections...
          </div>
        ) : collections?.collections && collections.collections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.collections.map(collection => (
              <Card
                key={collection.id}
                className="p-6 space-y-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/collections/${collection.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <FileJson className="w-8 h-8 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">
                        {collection.name}
                      </h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        {collection.format}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteDialogId(collection.id);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete collection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {collection.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {collection.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{collection.totalRequests} requests</span>
                  <span>
                    {new Date(collection.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <Button
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/scanning?collection=${collection.id}`);
                  }}
                  className="w-full"
                  size="sm"
                >
                  <Zap className="w-3 h-3 mr-2" />
                  Run Scan
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium text-foreground">No collections yet</p>
              <p className="text-sm text-muted-foreground">
                Import your first Postman or OpenAPI collection to get started
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteDialogId}
        onOpenChange={open => !open && setDeleteDialogId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the collection and all associated
              scans, findings, shadow APIs, and compliance reports. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
