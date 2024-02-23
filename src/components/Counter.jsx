import React, { useState, useEffect } from "react";

const Counter = ({ count }) => {
  const [emoji, setEmoji] = useState(null);
  const [error, setError] = useState(null);

  const getEmoji = (count) => {
    fetch(
      `https://okdqm6aeoc.execute-api.us-east-1.amazonaws.com/prod/try?count=${count}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }
        return response.json();
      })
      .then((data) => setEmoji(data.input))
      .catch((error) => setError(error.message)); // Handle fetch errors
  };

  useEffect(() => {
    if (count) {
      getEmoji(count);
    }
  }, [count]);

  return (
    <div className="text-white">
      {error ? (
        <p>Error: {error}</p>
      ) : (
        <p>Try! {emoji !== null ? emoji : "Click the button "}</p>
      )}
    </div>
  );
};

export default Counter;
