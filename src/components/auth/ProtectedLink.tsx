import { Link, type LinkProps } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

type ProtectedLinkProps = LinkProps & {
  children: React.ReactNode;
};

export default function ProtectedLink({ to, onClick, children, ...rest }: ProtectedLinkProps) {
  const { openAuthModal } = useAuthModal();

  return (
    <Link
      to={to}
      onClick={(event) => {
        if (!isAuthenticated()) {
          event.preventDefault();
          openAuthModal(typeof to === "string" ? to : "/");
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
