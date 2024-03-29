describe('Spectograph content check:', () => {
    beforeEach(() => {
        // Visit the page containing the component
        cy.visit('/');
        cy.getDataTest('spectogram-toggle-button').as('toggleButton');
    });



    it('displays the Title', () => {
        cy.getDataTest('spectogram-title').should('be.visible').and('have.text', 'Sound Recognition');


    });
    it('displays the Title text', () => {
        cy.getDataTest("spectogram-title-text").contains('This experiment needs access to your microphone and your device to be in quiter place.')
    });

    it('displays the paragraph', () => {
        cy.getDataTest("spectogram-p-text").contains("It can visualize audio as frequency of sound patterns (more red greater the frequency). To check if it's working you can start with (shshshshs) sound.");
    });

    it('correctly displays the toggle texts on the button', () => {
        cy.get('@toggleButton').contains('Visualize Audio');
        cy.getDataTest('spectogram-toggle-button').click();
        cy.get('@toggleButton').contains('Stop spectrogram');
    });


    it('Canvas renders when microphone is toggled', () => {

        cy.get('@toggleButton').click();
        cy.wait(3000);
        cy.get('canvas').should(($canvas) => {
            expect($canvas[0].width).to.be.greaterThan(0);
            expect($canvas[0].height).to.be.greaterThan(0);
        });
        cy.get('@toggleButton').click();
    });

    it('displays the author tag', () => {
        cy.getDataTest('author-tag').contains('abroro')
    });
});

describe('Is Browser actually listening to the audio ?', () => {

    beforeEach(() => {
        // Visit the page containing the component
        cy.visit('/');
        cy.getDataTest('spectogram-toggle-button').as('toggleButton');
    });

    it('starts capturing audio when "Visualize Audio" button is clicked', () => {
        // Spy on navigator.mediaDevices.getUserMedia
        cy.window().then((window) => {
            cy.spy(window.navigator.mediaDevices, 'getUserMedia').as('getUserMediaSpy');
        });

        // Click the "Visualize Audio" button
        cy.get('@toggleButton').click();

        // Check if the browser is capturing audio
        cy.get('@getUserMediaSpy').should('have.been.calledWith', { audio: true });


    });

});


describe('Is Spectogram getting generated ?', () => {
    it('Validates the content drawn on the canvas', () => {
        cy.visit('/');
        cy.getDataTest('spectogram-toggle-button').as('toggleButton');

        cy.get('@toggleButton').click();


        cy.wait(3000);


        cy.get('canvas').should('exist').then(($canvas) => {
            // Retrieve the 2D context of the canvas
            const context = $canvas[0].getContext('2d');

            // Retrieve pixel data from the entire canvas
            const imageData = context.getImageData(0, 0, $canvas[0].width, $canvas[0].height);

            // Check if the top-left pixel is filled with a specific color
            const topLeftPixel = getPixelColor(imageData, 0, 0);

            // Ensure the pixel color array has four numbers between 0 and 255
            cy.wrap(topLeftPixel).should('have.length', 4);
            cy.wrap(topLeftPixel).each((color) => {
                cy.wrap(color).should('be.within', 0, 255);
            });


        });
    });

    // Helper function to retrieve the color of a specific pixel from the image data
    function getPixelColor(imageData, x, y) {
        const index = (y * imageData.width + x) * 4;
        return [
            imageData.data[index],     // Red
            imageData.data[index + 1], // Green
            imageData.data[index + 2], // Blue
            imageData.data[index + 3]  // Alpha
        ];
    }

})



