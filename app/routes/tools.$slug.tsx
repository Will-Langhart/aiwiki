import { Outlet, useParams } from "react-router";

export default function ToolLayout() {
  const { slug } = useParams();
  return (
    <div className="container py-8">
      <p className="text-text-muted text-sm mb-4">Tool: {slug}</p>
      <Outlet />
    </div>
  );
}
