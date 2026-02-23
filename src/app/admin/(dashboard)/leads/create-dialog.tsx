"use client";

import { useState } from "react";
import { api, type RouterInputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";

type CreateOrderInput = RouterInputs["admin"]["createOrder"];
type LocaleOption = NonNullable<CreateOrderInput["locale"]>;
type StatusOption = NonNullable<CreateOrderInput["status"]>;

const localeOptions: Array<{ value: LocaleOption; label: string }> = [
    { value: "en", label: "English" },
    { value: "pt", label: "Portuguese" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "it", label: "Italian" },
];

const genreOptions = [
    { value: "pop", label: "Pop" },
    { value: "country", label: "Country" },
    { value: "rock", label: "Rock" },
    { value: "jovem-guarda", label: "Jovem Guarda" },
    { value: "rock-classico", label: "Rock Clássico" },
    { value: "pop-rock-brasileiro", label: "Pop Rock Brasileiro" },
    { value: "heavy-metal", label: "Heavy Metal" },
    { value: "rnb", label: "R&B" },
    { value: "jazz", label: "Jazz" },
    { value: "worship", label: "Worship/Gospel" },
    { value: "hiphop", label: "Rap" },
    { value: "funk", label: "Funk" },
    { value: "funk-carioca", label: "Funk Carioca" },
    { value: "funk-paulista", label: "Funk Paulista" },
    { value: "funk-melody", label: "Funk Melody" },
    { value: "brega", label: "Brega" },
    { value: "brega-romantico", label: "Brega Romântico" },
    { value: "tecnobrega", label: "Tecnobrega" },
    { value: "reggae", label: "Reggae" },
    { value: "lullaby", label: "Lullaby" },
    { value: "samba", label: "Samba" },
    { value: "pagode", label: "Pagode" },
    { value: "pagode-de-mesa", label: "Pagode de Mesa (Raiz)" },
    { value: "pagode-romantico", label: "Pagode Romântico (Anos 90)" },
    { value: "pagode-universitario", label: "Pagode Universitário / Novo Pagode" },
    { value: "forro", label: "Forro" },
    { value: "sertanejo-raiz", label: "Sertanejo Raiz" },
    { value: "sertanejo-universitario", label: "Sertanejo Universitário" },
    { value: "sertanejo-romantico", label: "Sertanejo Romântico" },
    { value: "forro-pe-de-serra-rapido", label: "Forró Pé-de-Serra (Dançante)" },
    { value: "forro-pe-de-serra-lento", label: "Forró Pé-de-Serra (Lento)" },
    { value: "forro-universitario", label: "Forró Universitário" },
    { value: "forro-eletronico", label: "Forró Eletrônico" },
    { value: "axe", label: "Axe" },
    { value: "capoeira", label: "Capoeira" },
    { value: "mpb-bossa-nova", label: "MPB / Bossa Nova (Clássica)" },
    { value: "mpb-cancao-brasileira", label: "MPB Clássica / Canção Brasileira" },
    { value: "mpb-pop", label: "Pop MPB (Radiofônica)" },
    { value: "mpb-intimista", label: "MPB Intimista / Folk-Pop Brasileiro" },
    { value: "musica-classica", label: "Música Clássica" },
    { value: "latina", label: "Música Latina" },
    { value: "salsa", label: "Salsa" },
    { value: "merengue", label: "Merengue" },
    { value: "bachata", label: "Bachata" },
    { value: "bolero", label: "Bolero" },
    { value: "cumbia", label: "Cumbia" },
    { value: "ranchera", label: "Ranchera" },
    { value: "balada", label: "Balada" },
    { value: "tango", label: "Tango" },
    { value: "valsa", label: "Valsa" },
    { value: "chanson", label: "Chanson" },
    { value: "variete", label: "Variete" },
    { value: "adoracion", label: "Adoracion (Worship)" },
    { value: "tarantella", label: "Tarantella" },
    { value: "napoletana", label: "Napoletana" },
    { value: "lirico", label: "Lirico" },
];

export function CreateLeadDialog() {
    const [open, setOpen] = useState(false);
    const utils = api.useUtils();

    const [formData, setFormData] = useState<CreateOrderInput & { status: StatusOption }>({
        recipient: "wife",
        recipientName: "",
        email: "",
        locale: "en",
        genre: "pop",
        vocals: "female",
        qualities: "",
        memories: "",
        message: "",
        status: "PENDING"
    });

    const createOrder = api.admin.createOrder.useMutation({
        onSuccess: () => {
            toast.success("Order Created", {
                description: "The new lead has been successfully added to the system.",
            });
            void utils.admin.getLeadsPaginated.invalidate();
            void utils.admin.getFilterOptions.invalidate();
            setOpen(false);
            setFormData({
                recipient: "wife",
                recipientName: "",
                email: "",
                locale: "en",
                genre: "pop",
                vocals: "female",
                qualities: "",
                memories: "",
                message: "",
                status: "PENDING"
            });
        }
    });

    const handleSubmit = () => {
        // Basic validation
        if (!formData.email || !formData.recipientName) {
            toast.error("Validation Error", {
                description: "Recipient Name and Email are required fields.",
            });
            return;
        }

        createOrder.mutate({
            ...formData,
            status: formData.status as "PENDING" | "PAID" | "IN_PROGRESS" | "COMPLETED" | "REVISION" | "CANCELLED" | "REFUNDED"
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg border-0">
                    <Plus className="w-4 h-4 mr-2" />
                    New Manual Lead
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-white/95 backdrop-blur-md">
                <DialogHeader className="border-b pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-full">
                            <Sparkles className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-slate-800">Create New Order</DialogTitle>
                            <DialogDescription>Manually enter a new lead into the system.</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Recipient Type</Label>
                            <Select
                                value={formData.recipient}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, recipient: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {["husband", "wife", "boyfriend", "girlfriend", "children", "father", "mother", "sibling", "friend", "myself", "group", "other"].map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Recipient Name *</Label>
                            <Input
                                value={formData.recipientName}
                                onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                                placeholder="e.g. Sarah"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Customer Email *</Label>
                        <Input
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="customer@example.com"
                            type="email"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Language</Label>
                            <Select
                                value={formData.locale}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, locale: val as LocaleOption }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {localeOptions.map((locale) => (
                                        <SelectItem key={locale.value} value={locale.value}>
                                            {locale.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Musical Genre</Label>
                            <Select
                                value={formData.genre}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, genre: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {genreOptions.map((genre) => (
                                        <SelectItem key={genre.value} value={genre.value}>
                                            {genre.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Vocals</Label>
                            <Select
                                value={formData.vocals}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, vocals: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["female", "male", "either"].map(v => (
                                        <SelectItem key={v} value={v}>{v}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Qualities & Traits</Label>
                        <Textarea
                            value={formData.qualities}
                            onChange={(e) => setFormData(prev => ({ ...prev, qualities: e.target.value }))}
                            placeholder="Describe what makes them special..."
                            className="min-h-[80px]"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Memories & Stories</Label>
                        <Textarea
                            value={formData.memories}
                            onChange={(e) => setFormData(prev => ({ ...prev, memories: e.target.value }))}
                            placeholder="Key memories to include in the song..."
                            className="min-h-[100px]"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Personal Message (Optional)</Label>
                        <Textarea
                            value={formData.message}
                            onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                            placeholder="A personal note..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={createOrder.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                            {createOrder.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Order
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
