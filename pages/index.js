// Main page that serves the static HTML content
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/index.html';
  }, []);

  return (
    <div>
      <p>Redirecting to application...</p>
    </div>
  );
}