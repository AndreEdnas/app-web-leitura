import { useEffect, useState } from 'react';
import { fetchSubfamilias } from '../services/api';

export default function useSubfamilias() {
  const [subfamilias, setSubfamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubfamilias()
      .then(data => setSubfamilias(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { subfamilias, loading, error };
}
