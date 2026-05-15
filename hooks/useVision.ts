import { useState, useEffect } from 'react';
export const useVision = () => {
  const [data, setData] = useState(null);
  return { data };
};
