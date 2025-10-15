"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, Clock, XCircle, Download, Trash2 } from "lucide-react";

/**
 * Component Library Demo Page
 * Demonstrates all UI components in action
 * Access at: http://localhost:3000/demo/components
 */
export default function ComponentDemoPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setShowDialog(true);
    }, 1500);
  };

  const mockCertificates = [
    { id: "1", title: "Web Development Certificate", institution: "Harvard University", status: "verified", date: "2024-01-15" },
    { id: "2", title: "Data Science Bootcamp", institution: "Stanford Online", status: "pending", date: "2024-02-20" },
    { id: "3", title: "Cloud Computing Essentials", institution: "MIT", status: "verified", date: "2024-03-10" },
    { id: "4", title: "Cybersecurity Fundamentals", institution: "Oxford", status: "rejected", date: "2024-03-25" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">Component Library Demo</h1>
          <p className="text-white/70">Testing all UI components in action</p>
        </div>

        {/* Button Variants */}
        <Card>
          <CardHeader>
            <CardTitle>Button Variants</CardTitle>
            <CardDescription>All button styles and sizes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">
                <CheckCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled>Disabled</Button>
              <Button>
                {loading ? "Loading..." : "With State"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Form Example */}
        <Card>
          <CardHeader>
            <CardTitle>Form Components</CardTitle>
            <CardDescription>Input fields with labels</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Submitting..." : "Submit Form"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Status Badges</CardTitle>
            <CardDescription>Certificate status indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="verified">
                <CheckCircle className="w-3 h-3 mr-1" />
                Verified
              </Badge>
              <Badge variant="pending">
                <Clock className="w-3 h-3 mr-1" />
                Pending
              </Badge>
              <Badge variant="rejected">
                <XCircle className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
              <Badge variant="outline">Draft</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Data Table</CardTitle>
            <CardDescription>Certificate listing example</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockCertificates.map((cert) => (
                  <TableRow key={cert.id}>
                    <TableCell className="font-medium">{cert.title}</TableCell>
                    <TableCell>{cert.institution}</TableCell>
                    <TableCell>{new Date(cert.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={cert.status as "verified" | "pending" | "rejected"}>
                        {cert.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Card Variants */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Verified
              </CardTitle>
              <CardDescription>Successfully verified</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-emerald-400">24</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                View All
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-400" />
                Pending
              </CardTitle>
              <CardDescription>Awaiting verification</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-yellow-400">8</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                Review
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                Rejected
              </CardTitle>
              <CardDescription>Failed verification</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-red-400">2</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                Details
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Dialog Trigger */}
        <Card>
          <CardHeader>
            <CardTitle>Dialog Component</CardTitle>
            <CardDescription>Modal/Dialog example</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowDialog(true)}>Open Dialog</Button>
          </CardContent>
        </Card>

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Form Submitted!</DialogTitle>
              <DialogDescription>
                Your form has been submitted successfully with the following details:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <p className="text-white/80">
                <strong>Email:</strong> {email || "Not provided"}
              </p>
              <p className="text-white/80">
                <strong>Password:</strong> {password ? "••••••••" : "Not provided"}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Close
              </Button>
              <Button onClick={() => setShowDialog(false)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
