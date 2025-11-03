import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Ticket } from 'lucide-react';
import { ticketAPI, usersAPI } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDevices } from '@/hooks/useDevices';

interface CreateTicketDialogProps {
    onTicketCreated?: () => void;
}

const CreateTicketDialog: React.FC<CreateTicketDialogProps> = ({ onTicketCreated }) => {
    const { user } = useAuth();
    const { devices } = useDevices();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: '',
        priority: 'medium',
        department: user?.department || '', // Will be set by backend, not user-editable
        location: '',
        deviceId: '',
        tags: [] as string[]
    });

    // Helper function to format department names for display
    const formatDepartmentName = (department: string | undefined): string => {
        if (!department) return 'Not specified';

        const departmentNames: Record<string, string> = {
            'School of IT': 'School of Information Technology',
            'School of Business': 'School of Business',
            'School of Hospitality': 'School of Hospitality',
            'Admission Department': 'Admission Department',
            'Other': 'Other',
            'IT': 'Information Technology',
            'IT Department': 'IT Department'
        };

        return departmentNames[department] || department;
    };

    const categories = [
        { value: 'technical_issue', label: 'Technical Issue' },
        { value: 'device_problem', label: 'Device Problem' },
        { value: 'network_issue', label: 'Network Issue' },
        { value: 'software_bug', label: 'Software Bug' },
        { value: 'feature_request', label: 'Feature Request' },
        { value: 'account_issue', label: 'Account Issue' },
        { value: 'security_concern', label: 'Security Concern' },
        { value: 'other', label: 'Other' }
    ];

    const priorities = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' }
    ];

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim() || !formData.description.trim() || !formData.category || formData.category === "" || !formData.priority || formData.priority === "") {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields and select a category and priority.",
                variant: "destructive"
            });
            return;
        }

        setLoading(true);
        try {
            // Extract user IDs from mentionedUsers
            const ticketPayload = {
                ...formData
            };
            await ticketAPI.createTicket(ticketPayload);
            toast({
                title: "Ticket Created",
                description: "Your support ticket has been submitted successfully.",
            });
            setOpen(false);
            setFormData({
                title: '',
                description: '',
                category: '',
                priority: 'medium',
                department: user?.department || '',
                location: '',
                deviceId: '',
                tags: []
            });
            onTicketCreated?.();
        } catch (error: unknown) {
            console.error('Ticket creation error:', error);
            let message = 'Failed to create ticket. Please try again.';
            
            // Handle different error formats
            if (error && typeof error === 'object') {
                // Check for API error response format
                if ('error' in error && typeof (error as any).error === 'string') {
                    message = (error as any).error;
                } else if ('message' in error && typeof (error as any).message === 'string') {
                    message = (error as any).message;
                } else if ('details' in error && typeof (error as any).details === 'string') {
                    message = (error as any).details;
                }
            }
            
            toast({
                title: "Error",
                description: message,
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Ticket className="w-4 h-4" />
                    Create Ticket
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Support Ticket</DialogTitle>
                    <DialogDescription>
                        Submit a support ticket for technical issues, feature requests, or other concerns.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title">Title *</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => handleInputChange('title', e.target.value)}
                            placeholder="Brief description of the issue"
                            required
                        />
                    </div>

                    {/* Category and Priority */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Category *</Label>
                            <Select value={formData.category || ""} onValueChange={(value) => handleInputChange('category', value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((category) => (
                                        <SelectItem key={category.value} value={category.value}>
                                            {category.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    {priorities.map((priority) => (
                                        <SelectItem key={priority.value} value={priority.value}>
                                            {priority.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Description *</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Detailed description of the issue, steps to reproduce, expected behavior, etc."
                            rows={4}
                            required
                        />
                    </div>

                    {/* Department (Read-only) and Location */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Department</Label>
                            <Input
                                value={formatDepartmentName(user?.department)}
                                disabled
                                className="bg-muted"
                                placeholder="Your department"
                            />
                            <p className="text-xs text-muted-foreground">
                                Tickets are automatically assigned to your department
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                                id="location"
                                value={formData.location}
                                onChange={(e) => handleInputChange('location', e.target.value)}
                                placeholder="Room/building location"
                            />
                        </div>
                    </div>

                    {/* Device Selection */}
                    <div className="space-y-2">
                        <Label>Related Device (Optional)</Label>
                        <Select value={formData.deviceId || ""} onValueChange={(value) => handleInputChange('deviceId', value === "none" ? "" : value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select device if issue is device-related" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {devices.map((device) => (
                                    <SelectItem key={device.id} value={device.id}>
                                        {device.name} - {device.location}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Submit Buttons */}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Ticket'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateTicketDialog;
