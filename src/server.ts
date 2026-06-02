import app from "./app";

const PORT = process.env.PORT || 4000;

console.log(`Running in Environment: ${process.env.NODE_ENV}`);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
